import { createSupabaseServerClient } from "@/lib/supabase/server";

const SUPPLY_ID_HEADERS = new Set([
  "supply_id",
  "id_insumo",
  "insumo_id",
  "id",
]);
const SUPPLY_NAME_HEADERS = new Set([
  "nombre",
  "nombre_insumo",
  "insumo",
  "supply",
  "supply_name",
]);
const SUPPLY_UNIT_HEADERS = new Set([
  "unidad",
  "unidad_medida",
  "unit",
  "uom",
]);
const SUPPLY_PRICE_HEADERS = new Set([
  "precio",
  "precio_actual",
  "precio_unitario",
  "unit_price",
  "costo_unitario",
]);

interface ParsedInputRow {
  lineNumber: number;
  sourceSupplyId: string | null;
  sourceSupplyName: string;
  sourceUnit: string | null;
  unitPrice: number;
}

export interface PriceImportSummary {
  batchId: string;
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  skippedRows: number;
  observedAt: string;
}

export async function ingestSupplyPriceCsvBatch(input: {
  csvText: string;
  fileName: string;
  observedAt: string;
}): Promise<PriceImportSummary> {
  const parsed = parseSupplyPriceCsv(input.csvText);
  const supabase = await createSupabaseServerClient();

  const { data: batch, error: batchError } = await supabase
    .from("supply_price_update_batches")
    .insert({
      source_file_name: input.fileName,
      source_channel: "upload_manual",
      observed_at: input.observedAt,
      notes: `Filas parseadas: ${parsed.rows.length}; descartadas: ${parsed.skippedRows}`,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    throw new Error(batchError?.message ?? "No se pudo crear el lote ETL.");
  }

  const { data: supplies, error: suppliesError } = await supabase
    .from("supply_catalog")
    .select("id, nombre");

  if (suppliesError) {
    throw new Error(suppliesError.message);
  }

  const byId = new Map((supplies ?? []).map((s) => [s.id, s.id]));
  const byNormalizedName = new Map(
    (supplies ?? []).map((s) => [normalizeKey(s.nombre), s.id]),
  );

  const payload = parsed.rows.map((row) => {
    const mappedSupplyId = row.sourceSupplyId && byId.has(row.sourceSupplyId)
      ? row.sourceSupplyId
      : byNormalizedName.get(normalizeKey(row.sourceSupplyName)) ?? null;

    return {
      batch_id: batch.id,
      line_number: row.lineNumber,
      source_supply_id: row.sourceSupplyId,
      source_supply_name: row.sourceSupplyName,
      source_unit: row.sourceUnit,
      supply_id: mappedSupplyId,
      unit_price: row.unitPrice,
      currency: "COP",
      status: mappedSupplyId ? "matched" : "unmatched",
      notes: mappedSupplyId ? null : "No se encontro coincidencia en supply_catalog",
    };
  });

  if (payload.length > 0) {
    const { error: rowsError } = await supabase
      .from("supply_price_update_rows")
      .insert(payload);

    if (rowsError) {
      throw new Error(rowsError.message);
    }
  }

  const matchedRows = payload.filter((row) => row.status === "matched").length;
  const unmatchedRows = payload.length - matchedRows;

  return {
    batchId: batch.id,
    totalRows: payload.length,
    matchedRows,
    unmatchedRows,
    skippedRows: parsed.skippedRows,
    observedAt: input.observedAt,
  };
}

function parseSupplyPriceCsv(csvText: string): {
  rows: ParsedInputRow[];
  skippedRows: number;
} {
  const lines = csvText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    throw new Error("El archivo debe incluir encabezado y al menos una fila.");
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map((h) => normalizeHeader(h));

  const idxId = findFirstHeaderIndex(headers, SUPPLY_ID_HEADERS);
  const idxName = findFirstHeaderIndex(headers, SUPPLY_NAME_HEADERS);
  const idxUnit = findFirstHeaderIndex(headers, SUPPLY_UNIT_HEADERS);
  const idxPrice = findFirstHeaderIndex(headers, SUPPLY_PRICE_HEADERS);

  if (idxPrice < 0 || (idxId < 0 && idxName < 0)) {
    throw new Error(
      "Encabezados invalidos. Requeridos: supply_id o nombre, y precio_actual.",
    );
  }

  const rows: ParsedInputRow[] = [];
  let skippedRows = 0;

  for (let i = 1; i < lines.length; i += 1) {
    const raw = parseCsvLine(lines[i], delimiter);
    const sourceSupplyId = idxId >= 0 ? normalizeEmpty(raw[idxId]) : null;
    const sourceSupplyName = idxName >= 0 ? normalizeEmpty(raw[idxName]) : null;
    const sourceUnit = idxUnit >= 0 ? normalizeEmpty(raw[idxUnit]) : null;
    const priceRaw = idxPrice >= 0 ? normalizeEmpty(raw[idxPrice]) : null;

    const unitPrice = parsePrice(priceRaw);
    const hasIdentity = Boolean(sourceSupplyId || sourceSupplyName);

    if (!hasIdentity || unitPrice == null) {
      skippedRows += 1;
      continue;
    }

    rows.push({
      lineNumber: i + 1,
      sourceSupplyId,
      sourceSupplyName: sourceSupplyName ?? sourceSupplyId ?? "",
      sourceUnit,
      unitPrice,
    });
  }

  if (rows.length === 0) {
    throw new Error("No se detectaron filas validas para importar.");
  }

  return { rows, skippedRows };
}

function detectDelimiter(headerLine: string): "," | ";" {
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semicolons = (headerLine.match(/;/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

function parseCsvLine(line: string, delimiter: "," | ";"): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === delimiter && !inQuotes) {
      out.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  out.push(current.trim());
  return out;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmpty(value: string | undefined): string | null {
  if (value == null) return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}

function findFirstHeaderIndex(headers: string[], aliases: Set<string>): number {
  return headers.findIndex((h) => aliases.has(h));
}

function parsePrice(value: string | null): number | null {
  if (!value) return null;

  const cleaned = value
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");

  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;

  return Number(n.toFixed(2));
}
