"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { nexumApiRequest } from "@/lib/nexum-api/client";
import type { ParsedPhase } from "@/lib/contract-parser";

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
          phases,
        },
      },
    );

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
