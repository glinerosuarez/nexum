import { NextResponse } from "next/server";
import { analyzeContractFiles } from "@/lib/contract-parser";
import {
  getNexumApiBaseUrl,
  resolveFirebaseBearerFromServerContext,
} from "@/lib/nexum-api/client";

export const runtime = "nodejs";

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        { detail: "No recibimos archivos para analizar." },
        { status: 400 },
      );
    }

    const [analysis, hashes] = await Promise.all([
      analyzeContractFiles(files),
      Promise.all(files.map((file) => sha256Hex(file))),
    ]);

    const payload = {
      merged_preview: analysis.merged_preview,
      documents: analysis.documents.map((document, index) => ({
        client_document_id: document.id,
        filename: document.filename,
        source: document.source,
        confidence: document.confidence,
        parse_status: document.parse_status,
        content_type: document.content_type,
        byte_size: document.byte_size,
        content_hash: hashes[index],
        notes: document.notes,
        sheet_names: document.sheet_names,
        preview: document.preview,
        extracted_row_count: document.extracted_row_count,
      })),
      extracted_rows: analysis.extracted_rows.map((row) => ({
        client_row_id: row.id,
        client_document_id: row.document_id,
        source: row.source,
        source_ref: row.source_ref,
        raw_name: row.raw_name,
        raw_unit: row.raw_unit,
        raw_category: row.raw_category,
        raw_quantity: row.raw_quantity,
        raw_unit_price: row.raw_unit_price,
        raw_total_price: row.raw_total_price,
        normalized_name: row.normalized_name,
        normalized_unit: row.normalized_unit,
        normalized_category: row.normalized_category,
        normalization_key: row.normalization_key,
        notes: row.notes,
        raw_columns: row.raw_columns,
      })),
      normalized_supplies: analysis.normalized_supplies.map((supply) => ({
        client_normalized_key: supply.key,
        display_name: supply.display_name,
        normalized_name: supply.normalized_name,
        normalized_unit: supply.normalized_unit,
        normalized_category: supply.normalized_category,
        quantity_total: supply.quantity_total,
        unit_price_reference: supply.unit_price_reference,
        total_price_reference: supply.total_price_reference,
        extracted_row_ids: supply.extracted_row_ids,
        source_document_ids: supply.source_document_ids,
        row_count: supply.row_count,
        source_count: supply.source_count,
      })),
      row_normalizations: analysis.row_normalizations.map((row) => ({
        client_extracted_row_id: row.extracted_row_id,
        client_normalized_key: row.normalized_key,
        normalization_reason: row.normalization_reason,
      })),
    };

    const baseUrl = getNexumApiBaseUrl();
    const headers = new Headers({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    const bearer = await resolveFirebaseBearerFromServerContext();
    if (bearer) {
      headers.set("Authorization", bearer);
    }

    const upstream = await fetch(`${baseUrl}/project-input-batches`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const upstreamPayload = (await upstream
      .json()
      .catch(() => ({}))) as {
      detail?: string;
      input_batch_id?: string;
      document_id_map?: Record<string, string>;
      extracted_row_id_map?: Record<string, string>;
      normalized_supply_id_map?: Record<string, string>;
    };

    if (!upstream.ok || !upstreamPayload.input_batch_id) {
      return NextResponse.json(
        {
          detail:
            upstreamPayload.detail ??
            "No pudimos persistir el lote de insumos analizado.",
        },
        { status: upstream.status || 502 },
      );
    }

    const documentIdMap = upstreamPayload.document_id_map ?? {};
    const shadowExtractionChunks = analysis.shadow_extraction_chunks
      .map((chunk) => {
        const persistedDocumentId = documentIdMap[chunk.document_id];
        if (!persistedDocumentId) return null;
        return {
          ...chunk,
          document_id: persistedDocumentId,
        };
      })
      .filter((chunk): chunk is NonNullable<typeof chunk> => chunk !== null);

    return NextResponse.json({
      preview: analysis.merged_preview,
      input_batch_id: upstreamPayload.input_batch_id,
      shadow_extraction_chunks: shadowExtractionChunks,
    });
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "No pudimos analizar los archivos.",
      },
      { status: 500 },
    );
  }
}
