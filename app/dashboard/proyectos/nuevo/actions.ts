"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { nexumApiRequest } from "@/lib/nexum-api/client";
import type { ParsedPhase, ShadowExtractionChunk } from "@/lib/contract-parser";

export interface CreateActionState {
  ok: boolean;
  message: string | null;
}

function isNextRedirectError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("NEXT_REDIRECT");
}

function asDate(value: FormDataEntryValue | null): string | null {
  const v = (value ?? "").toString().trim();
  if (!v) return null;
  return v;
}

function asNumber(value: FormDataEntryValue | null): number | null {
  const v = (value ?? "").toString().trim().replace(/\./g, "").replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parsePhases(raw: string): ParsedPhase[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ParsedPhase[];
  } catch {
    return [];
  }
}

function parseShadowExtractionChunks(raw: string): ShadowExtractionChunk[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ShadowExtractionChunk[];
  } catch {
    return [];
  }
}

export async function createProjectAction(
  _prev: CreateActionState,
  formData: FormData,
): Promise<CreateActionState> {
  const nombre = (formData.get("nombre") ?? "").toString().trim();
  if (!nombre) {
    return { ok: false, message: "El nombre del proyecto es obligatorio." };
  }

  const phases = parsePhases((formData.get("phases_json") ?? "[]").toString())
    .filter((phase) => (phase.nombre ?? "").trim().length > 0)
    .map((phase, index) => ({
      nombre: phase.nombre.trim(),
      sort_order: phase.sort_order ?? index + 1,
      fecha_inicio: phase.fecha_inicio ?? null,
      fecha_fin: phase.fecha_fin ?? null,
      porcentaje_completado: phase.porcentaje_completado ?? 0,
      costo: phase.costo ?? 0,
    }));
  const inputBatchId = (formData.get("input_batch_id") ?? "").toString().trim() || null;
  const shadowExtractionChunks = parseShadowExtractionChunks(
    (formData.get("shadow_extraction_chunks_json") ?? "[]").toString(),
  );

  try {
    const response = await nexumApiRequest<{ ok: boolean; project_id: string }>(
      "/projects",
      {
        method: "POST",
        body: {
          nombre,
          descripcion: (formData.get("descripcion") ?? "").toString().trim() || null,
          ubicacion: (formData.get("ubicacion") ?? "").toString().trim() || null,
          estado: (formData.get("estado") ?? "planificacion").toString(),
          fecha_inicio_planeada: asDate(formData.get("fecha_inicio_planeada")),
          fecha_fin_planeada: asDate(formData.get("fecha_fin_planeada")),
          fecha_inicio_real: asDate(formData.get("fecha_inicio_real")),
          presupuesto_total: asNumber(formData.get("presupuesto_total")) ?? 0,
          idioma: (formData.get("idioma") ?? "en").toString(),
          input_batch_id: inputBatchId,
          phases,
        },
      },
    );

    if (inputBatchId && shadowExtractionChunks.length > 0) {
      const sourceDocumentCount = new Set(
        shadowExtractionChunks.map((chunk) => chunk.document_id),
      ).size;
      try {
        await nexumApiRequest<{
          agentic_run_id: string;
          candidate_count?: number;
        }>(`/project-input-batches/${inputBatchId}/agentic-shadow-runs/run`, {
          method: "POST",
          body: {
            project_id: response.project_id,
            pipeline_variant: "agentic_shadow",
            status: "running",
            model_name: "gemini-2.5-flash",
            retrieval_strategy: "document_local_context_v1",
            prompt_version: "vertex_chunk_extractor_v1",
            benchmark_instance_id: inputBatchId,
            qualification_model_name: "shadow_qualification_heuristic_v1",
            qualification_retrieval_strategy: "document_local_context_v1",
            qualification_prompt_version: "heuristic_seed_v1",
            qualification_summary: {
              chunk_count: shadowExtractionChunks.length,
              triggered_after_project_create: true,
              project_id: response.project_id,
            },
            summary: {
              source_document_count: sourceDocumentCount,
              chunk_count: shadowExtractionChunks.length,
              triggered_after_project_create: true,
              project_id: response.project_id,
            },
            chunks: shadowExtractionChunks,
          },
        });
      } catch (error) {
        console.error("Agentic shadow run failed after project creation", {
          projectId: response.project_id,
          inputBatchId,
          error,
        });
      }
    }

    revalidatePath("/dashboard/proyectos");
    redirect(`/dashboard/proyectos/${response.project_id}/agente?created=1`);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    return {
      ok: false,
      message: `No pudimos guardar el proyecto: ${error instanceof Error ? error.message : "error desconocido"}`,
    };
  }
}

export interface DeleteActionState {
  ok: boolean;
  message: string | null;
}

export async function deleteProjectAction(
  _prev: DeleteActionState,
  formData: FormData,
): Promise<DeleteActionState> {
  const id = (formData.get("project_id") ?? "").toString().trim();
  if (!id) {
    return { ok: false, message: "Falta el identificador del proyecto." };
  }
  const confirmName = (formData.get("confirm_name") ?? "").toString().trim();
  const expectedName = (formData.get("expected_name") ?? "").toString().trim();
  if (confirmName !== expectedName) {
    return {
      ok: false,
      message: "Escribe el nombre exacto del proyecto para confirmar.",
    };
  }

  try {
    await nexumApiRequest(`/projects/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  } catch (error) {
    return {
      ok: false,
      message: `No pudimos eliminar el proyecto: ${error instanceof Error ? error.message : "error desconocido"}`,
    };
  }

  revalidatePath("/dashboard/proyectos");
  redirect(`/dashboard/proyectos?deleted=1`);
}
