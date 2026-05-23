"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ParsedPhase } from "@/lib/contract-parser";

export interface CreateActionState {
  ok: boolean;
  message: string | null;
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

function clampPct(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Number(value)));
}

export async function createProjectAction(
  _prev: CreateActionState,
  formData: FormData,
): Promise<CreateActionState> {
  const nombre = (formData.get("nombre") ?? "").toString().trim();
  if (!nombre) {
    return { ok: false, message: "El nombre del proyecto es obligatorio." };
  }

  const descripcion = (formData.get("descripcion") ?? "").toString().trim() || null;
  const ubicacion = (formData.get("ubicacion") ?? "").toString().trim() || null;
  const fecha_inicio_planeada = asDate(formData.get("fecha_inicio_planeada"));
  const fecha_fin_planeada = asDate(formData.get("fecha_fin_planeada"));
  const fecha_inicio_real = asDate(formData.get("fecha_inicio_real"));
  const presupuesto_total = asNumber(formData.get("presupuesto_total")) ?? 0;
  const estado = (formData.get("estado") ?? "planificacion").toString();

  const phasesPayload = (formData.get("phases_json") ?? "[]").toString();
  let phases: ParsedPhase[] = [];
  try {
    const parsed = JSON.parse(phasesPayload);
    if (Array.isArray(parsed)) phases = parsed as ParsedPhase[];
  } catch {
    phases = [];
  }

  const supabase = await createSupabaseServerClient();

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      nombre,
      descripcion,
      ubicacion,
      estado: estado as
        | "planificacion"
        | "en_ejecucion"
        | "pausado"
        | "finalizado"
        | "cancelado",
      fecha_inicio_planeada,
      fecha_fin_planeada,
      fecha_inicio_real,
      presupuesto_total,
    })
    .select("id")
    .single();

  if (error || !project) {
    return {
      ok: false,
      message: `No pudimos guardar el proyecto: ${error?.message ?? "error desconocido"}`,
    };
  }

  if (phases.length > 0) {
    const phaseRows = phases
      .filter((p) => (p.nombre ?? "").trim().length > 0)
      .map((p, idx) => ({
        project_id: project.id,
        nombre: p.nombre.trim().slice(0, 120),
        descripcion: null,
        sort_order: p.sort_order ?? idx + 1,
        fecha_inicio: p.fecha_inicio,
        fecha_fin: p.fecha_fin,
        costo_planeado: p.costo ?? 0,
        costo_real: 0,
        porcentaje_completado: clampPct(p.porcentaje_completado),
      }));
    if (phaseRows.length > 0) {
      await supabase.from("project_phases").insert(phaseRows);
    }
  }

  revalidatePath("/dashboard/proyectos");
  redirect(`/dashboard/proyectos/${project.id}?created=1`);
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

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("projects").delete().eq("id", id);

  if (error) {
    return {
      ok: false,
      message: `No pudimos eliminar el proyecto: ${error.message}`,
    };
  }

  revalidatePath("/dashboard/proyectos");
  redirect(`/dashboard/proyectos?deleted=1`);
}
