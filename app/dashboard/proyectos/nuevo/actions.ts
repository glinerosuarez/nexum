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
      }));
    if (phaseRows.length > 0) {
      await supabase.from("project_phases").insert(phaseRows);
    }
  }

  revalidatePath("/dashboard/proyectos");
  redirect(`/dashboard/proyectos/${project.id}?created=1`);
}
