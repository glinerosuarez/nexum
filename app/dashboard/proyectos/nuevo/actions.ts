"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ParsedPhase } from "@/lib/contract-parser";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

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

function safeMoney(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Number(value));
}

function phaseBudgetOrFallback(
  phaseBudget: number | null | undefined,
  fallbackPerPhase: number,
): number {
  const budget = safeMoney(phaseBudget);
  if (budget > 0) return budget;
  return fallbackPerPhase > 0 ? fallbackPerPhase : 0;
}

async function ensureBootstrapCriticalSupplies(
  supabase: SupabaseServerClient,
): Promise<
  Array<{
    id: string;
    nombre: string;
    unidad_medida: string;
    precio_referencia: number;
  }>
> {
  const { data: existing } = await supabase
    .from("supply_catalog")
    .select("id, nombre, unidad_medida, precio_referencia")
    .eq("es_critico", true)
    .eq("activo", true)
    .order("precio_referencia", { ascending: false })
    .limit(12);

  if ((existing?.length ?? 0) > 0) {
    return (existing ?? []).map((s) => ({
      id: s.id,
      nombre: s.nombre,
      unidad_medida: s.unidad_medida,
      precio_referencia: safeMoney(s.precio_referencia),
    }));
  }

  const fallback = [
    {
      nombre: "Concreto 3000 PSI",
      descripcion: "Insumo crítico bootstrap para onboarding de demo.",
      unidad_medida: "m3",
      tipo: "material" as const,
      precio_referencia: 390000,
      disponibilidad: "disponible" as const,
      es_critico: true,
      activo: true,
    },
    {
      nombre: "Acero corrugado #5",
      descripcion: "Insumo crítico bootstrap para onboarding de demo.",
      unidad_medida: "kg",
      tipo: "material" as const,
      precio_referencia: 5200,
      disponibilidad: "escaso" as const,
      es_critico: true,
      activo: true,
    },
    {
      nombre: "Formaleta metalica",
      descripcion: "Insumo crítico bootstrap para onboarding de demo.",
      unidad_medida: "m2",
      tipo: "subcontrato" as const,
      precio_referencia: 42000,
      disponibilidad: "agotado" as const,
      es_critico: true,
      activo: true,
    },
  ];

  await supabase
    .from("supply_catalog")
    .upsert(fallback, { onConflict: "nombre" });

  const { data: seeded } = await supabase
    .from("supply_catalog")
    .select("id, nombre, unidad_medida, precio_referencia")
    .eq("es_critico", true)
    .eq("activo", true)
    .order("precio_referencia", { ascending: false })
    .limit(12);

  return (seeded ?? []).map((s) => ({
    id: s.id,
    nombre: s.nombre,
    unidad_medida: s.unidad_medida,
    precio_referencia: safeMoney(s.precio_referencia),
  }));
}

async function bootstrapActivitiesAndSuppliesFromPhases(input: {
  supabase: SupabaseServerClient;
  projectId: string;
  phases: Array<{
    id: string;
    nombre: string;
    sort_order: number;
    costo_planeado: number | null;
    porcentaje_completado: number | null;
  }>;
  projectBudget: number;
}): Promise<void> {
  if (input.phases.length === 0) return;

  const totalPhaseBudget = input.phases.reduce(
    (acc, ph) => acc + safeMoney(ph.costo_planeado),
    0,
  );
  const fallbackPerPhase =
    totalPhaseBudget > 0 || input.phases.length === 0
      ? 0
      : safeMoney(input.projectBudget) / input.phases.length;

  const activityRows = input.phases.map((phase) => ({
    phase_id: phase.id,
    nombre: `Ejecución ${phase.nombre}`.slice(0, 120),
    descripcion: "Actividad base creada desde onboarding contractual.",
    unidad_medida: "global",
    cantidad_planeada: 1,
    cantidad_ejecutada: clampPct(phase.porcentaje_completado) / 100,
    sort_order: 1,
  }));

  const { data: activities, error: activitiesError } = await input.supabase
    .from("activities")
    .insert(activityRows)
    .select("id, phase_id");

  if (activitiesError || !activities || activities.length === 0) {
    throw new Error(
      `No pudimos crear actividades base: ${activitiesError?.message ?? "sin actividades insertadas"}`,
    );
  }

  const criticalSupplies = await ensureBootstrapCriticalSupplies(input.supabase);
  if (criticalSupplies.length === 0) return;

  const phaseById = new Map(input.phases.map((ph) => [ph.id, ph]));
  const supplyRows = activities.map((activity, idx) => {
    const phase = phaseById.get(activity.phase_id);
    const supply = criticalSupplies[idx % criticalSupplies.length];
    const unitPrice = Math.max(1, safeMoney(supply?.precio_referencia) || 1);
    const targetBudget = phaseBudgetOrFallback(phase?.costo_planeado, fallbackPerPhase);
    const qtyPlannedRaw = targetBudget > 0 ? targetBudget / unitPrice : 1;
    const qtyPlanned = Number(Math.max(0.0001, qtyPlannedRaw).toFixed(4));
    const qtyExecuted = Number(
      (qtyPlanned * (clampPct(phase?.porcentaje_completado) / 100)).toFixed(4),
    );

    return {
      activity_id: activity.id,
      supply_id: supply.id,
      cantidad_planeada: qtyPlanned,
      cantidad_ejecutada: qtyExecuted,
      precio_unitario: unitPrice,
    };
  });

  const { error: suppliesError } = await input.supabase
    .from("activity_supplies")
    .insert(supplyRows);

  if (suppliesError) {
    throw new Error(`No pudimos crear líneas APU base: ${suppliesError.message}`);
  }

  await input.supabase
    .from("projects")
    .update({
      presupuesto_total:
        totalPhaseBudget > 0 ? Number(totalPhaseBudget.toFixed(2)) : input.projectBudget,
    })
    .eq("id", input.projectId);
}

async function invokeSupplyAgentForProject(input: {
  supabase: SupabaseServerClient;
  projectId: string;
  userId: string | null;
  accessToken: string | null;
}): Promise<
  | { ok: true }
  | { ok: false; reason: "timeout" | "edge_function_error"; detail: string }
> {
  const invokePromise = input.supabase.functions.invoke("run_supply_cost_agent", {
    body: {
      project_id: input.projectId,
      mode: "manual",
      dry_run: false,
      user_id: input.userId ?? undefined,
      access_token: input.accessToken ?? undefined,
    },
  });

  const timeoutMs = 45_000;
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("agent_timeout")), timeoutMs);
  });

  let result: Awaited<ReturnType<typeof input.supabase.functions.invoke>>;
  try {
    result = await Promise.race([invokePromise, timeoutPromise]) as Awaited<
      ReturnType<typeof input.supabase.functions.invoke>
    >;
  } catch (error) {
    return {
      ok: false,
      reason: "timeout",
      detail: error instanceof Error ? error.message : "agent_timeout",
    };
  }

  if (result.error) {
    return {
      ok: false,
      reason: "edge_function_error",
      detail: result.error.message,
    };
  }

  return { ok: true };
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
      const { data: insertedPhases, error: phaseInsertError } = await supabase
        .from("project_phases")
        .insert(phaseRows)
        .select("id, nombre, sort_order, costo_planeado, porcentaje_completado");

      if (phaseInsertError) {
        throw new Error(`No pudimos crear las fases: ${phaseInsertError.message}`);
      }

      if ((insertedPhases?.length ?? 0) > 0) {
        try {
          await bootstrapActivitiesAndSuppliesFromPhases({
            supabase,
            projectId: project.id,
            phases: insertedPhases ?? [],
            projectBudget: presupuesto_total,
          });
        } catch (bootstrapError) {
          console.warn(
            "[onboarding] actividad/APU bootstrap falló",
            bootstrapError,
          );
        }
      }
    }
  }

  const [{ data: userData }, { data: sessionData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);

  const agentInvocation = await invokeSupplyAgentForProject({
    supabase,
    projectId: project.id,
    userId: userData.user?.id ?? null,
    accessToken: sessionData.session?.access_token ?? null,
  });
  if (!agentInvocation.ok) {
    console.warn(
      `[onboarding] run_supply_cost_agent did not complete (${agentInvocation.reason}): ${agentInvocation.detail}`,
    );
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
