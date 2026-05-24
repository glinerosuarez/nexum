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

async function ensureBootstrapSupplySources(
  supabase: SupabaseServerClient,
  supplies: Array<{ id: string; nombre: string }>,
): Promise<void> {
  if (supplies.length === 0) return;

  const { data: existingSources } = await supabase
    .from("supply_price_sources")
    .select("supply_id")
    .in("supply_id", supplies.map((s) => s.id))
    .eq("is_active", true);

  const mappedSupplyIds = new Set((existingSources ?? []).map((row) => row.supply_id));

  const templatesByName: Record<
    string,
    { source_name: string; source_url: string; parse_config: Record<string, unknown> }
  > = {
    "concreto 3000 psi": {
      source_name: "fred_cement",
      source_url: "https://fred.stlouisfed.org/series/WPU0573",
      parse_config: {
        provider: "fred",
        series_id: "WPU0573",
        series_key: "cement",
        label: "PPI: Cement (US market proxy)",
        price_unit: "index",
        keywords: ["cemento", "cement", "concreto", "concrete"],
      },
    },
    "acero corrugado #5": {
      source_name: "fred_steel",
      source_url: "https://fred.stlouisfed.org/series/WPU101707",
      parse_config: {
        provider: "fred",
        series_id: "WPU101707",
        series_key: "steel",
        label: "PPI: Iron and steel (US market proxy)",
        price_unit: "index",
        keywords: ["acero", "steel", "varilla", "rebar"],
      },
    },
    "formaleta metalica": {
      source_name: "fred_steel_formwork",
      source_url: "https://fred.stlouisfed.org/series/WPU101707",
      parse_config: {
        provider: "fred",
        series_id: "WPU101707",
        series_key: "steel",
        label: "PPI: Iron and steel (US market proxy for metal formwork)",
        price_unit: "index",
        keywords: ["formaleta", "formwork", "metalica", "steel", "acero"],
      },
    },
  };

  const rowsToInsert = supplies
    .filter((s) => !mappedSupplyIds.has(s.id))
    .map((s) => {
      const key = s.nombre.toLowerCase().trim();
      const template = templatesByName[key];
      if (!template) return null;
      return {
        supply_id: s.id,
        source_name: template.source_name,
        source_url: template.source_url,
        parse_config: template.parse_config,
        is_active: true,
        priority: 1,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rowsToInsert.length === 0) return;

  await supabase
    .from("supply_price_sources")
    .upsert(rowsToInsert, { onConflict: "supply_id,source_url" });
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
}): Promise<{ ok: true } | { ok: false; detail: string }> {
  if (input.phases.length === 0) return { ok: true };

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
    return {
      ok: false,
      detail: `No pudimos crear actividades base: ${activitiesError?.message ?? "sin actividades insertadas"}`,
    };
  }

  const criticalSupplies = await ensureBootstrapCriticalSupplies(input.supabase);
  if (criticalSupplies.length === 0) {
    return { ok: false, detail: "No hay insumos críticos para bootstrap." };
  }
  await ensureBootstrapSupplySources(input.supabase, criticalSupplies);

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
    return {
      ok: false,
      detail: `No pudimos crear líneas APU base: ${suppliesError.message}`,
    };
  }

  await input.supabase
    .from("projects")
    .update({
      presupuesto_total:
        totalPhaseBudget > 0 ? Number(totalPhaseBudget.toFixed(2)) : input.projectBudget,
    })
    .eq("id", input.projectId);

  return { ok: true };
}

async function createBudgetSnapshotFromProjectSupplies(input: {
  supabase: SupabaseServerClient;
  projectId: string;
}): Promise<{ ok: true } | { ok: false; detail: string }> {
  const { data: versionRows, error: versionError } = await input.supabase
    .from("budget_snapshots")
    .select("version_number")
    .eq("project_id", input.projectId)
    .order("version_number", { ascending: false })
    .limit(1);

  if (versionError) {
    return { ok: false, detail: `No pudimos leer versiones de presupuesto: ${versionError.message}` };
  }

  const nextVersion = ((versionRows?.[0]?.version_number ?? 0) as number) + 1;

  const { data: supplyRows, error: supplyRowsError } = await input.supabase
    .from("activity_supplies")
    .select(
      "id, subtotal, activities!inner(id, phase_id, project_phases!inner(project_id))",
    );

  if (supplyRowsError) {
    return { ok: false, detail: `No pudimos leer líneas APU para snapshot: ${supplyRowsError.message}` };
  }

  type ActivitySupplyJoin = {
    id: string;
    subtotal: number | string | null;
    activities:
      | {
          id: string;
          phase_id: string;
          project_phases:
            | { project_id: string }
            | { project_id: string }[]
            | null;
        }
      | {
          id: string;
          phase_id: string;
          project_phases:
            | { project_id: string }
            | { project_id: string }[]
            | null;
        }[]
      | null;
  };

  const projectSupplyIds: string[] = [];
  let totalBudget = 0;
  for (const row of (supplyRows ?? []) as ActivitySupplyJoin[]) {
    const activityField = Array.isArray(row.activities)
      ? row.activities[0]
      : row.activities;
    const phasesField = activityField?.project_phases;
    const phasesArray = Array.isArray(phasesField)
      ? phasesField
      : phasesField
        ? [phasesField]
        : [];
    const belongs = phasesArray.some((p) => p?.project_id === input.projectId);
    if (!belongs) continue;
    projectSupplyIds.push(row.id);
    totalBudget += safeMoney(Number(row.subtotal ?? 0));
  }

  if (projectSupplyIds.length === 0) {
    return { ok: false, detail: "No encontramos activity_supplies para crear snapshot." };
  }

  const { data: snapshot, error: snapshotError } = await input.supabase
    .from("budget_snapshots")
    .insert({
      project_id: input.projectId,
      version_number: nextVersion,
      estado: "borrador",
      total_budget: Number(totalBudget.toFixed(2)),
      notes: "Snapshot automático creado desde onboarding.",
    })
    .select("id")
    .single();

  if (snapshotError || !snapshot) {
    return { ok: false, detail: `No pudimos crear budget_snapshot: ${snapshotError?.message ?? "sin snapshot"}` };
  }

  const { data: rowsForItems, error: rowsForItemsError } = await input.supabase
    .from("activity_supplies")
    .select("id, cantidad_planeada, precio_unitario")
    .in("id", projectSupplyIds);

  if (rowsForItemsError) {
    return { ok: false, detail: `No pudimos leer líneas para budget_snapshot_items: ${rowsForItemsError.message}` };
  }

  const snapshotItems = (rowsForItems ?? []).map((r) => ({
    budget_snapshot_id: snapshot.id,
    activity_supply_id: r.id,
    cantidad_planeada: r.cantidad_planeada,
    precio_unitario: r.precio_unitario,
  }));

  const { error: itemsError } = await (input.supabase as unknown as {
    from: (table: string) => { insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }> };
  })
    .from("budget_snapshot_items")
    .insert(snapshotItems);

  if (itemsError) {
    return { ok: false, detail: `No pudimos crear budget_snapshot_items: ${itemsError.message}` };
  }

  return { ok: true };
}

async function ensureDemoProjectMemberships(input: {
  supabase: SupabaseServerClient;
  projectId: string;
  creatorUserId: string | null;
}): Promise<void> {
  const roleByEmail: Record<string, "director_proyecto" | "residente_obra" | "residente_administrativo"> = {
    "directora.proyecto@example.com": "director_proyecto",
    "residente.obra@example.com": "residente_obra",
    "residente.admin@example.com": "residente_administrativo",
  };

  const { data: profiles } = await input.supabase
    .from("profiles")
    .select("id, email")
    .limit(50);

  const membershipMap = new Map<
    string,
    {
      project_id: string;
      profile_id: string;
      role: "director_proyecto" | "residente_obra" | "residente_administrativo";
      active: boolean;
    }
  >();

  for (const p of profiles ?? []) {
    const email = (p.email ?? "").toLowerCase().trim();
    const mappedRole = roleByEmail[email] ?? "director_proyecto";
    membershipMap.set(p.id, {
      project_id: input.projectId,
      profile_id: p.id,
      role: mappedRole,
      active: true,
    });
  }

  if (input.creatorUserId) {
    membershipMap.set(input.creatorUserId, {
      project_id: input.projectId,
      profile_id: input.creatorUserId,
      role: "director_proyecto",
      active: true,
    });
  }

  const memberships = [...membershipMap.values()];
  if (memberships.length === 0) return;

  await input.supabase
    .from("project_memberships")
    .upsert(memberships, { onConflict: "project_id,profile_id" });
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
  const { data: userData } = await supabase.auth.getUser();
  const creatorUserId = userData.user?.id ?? null;

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

  await ensureDemoProjectMemberships({
    supabase,
    projectId: project.id,
    creatorUserId,
  });

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
        const bootstrap = await bootstrapActivitiesAndSuppliesFromPhases({
          supabase,
          projectId: project.id,
          phases: insertedPhases ?? [],
          projectBudget: presupuesto_total,
        });
        if (!bootstrap.ok) {
          console.warn(`[onboarding] actividad/APU bootstrap falló: ${bootstrap.detail}`);
        } else {
          const snapshotResult = await createBudgetSnapshotFromProjectSupplies({
            supabase,
            projectId: project.id,
          });
          if (!snapshotResult.ok) {
            console.warn(`[onboarding] snapshot presupuestal falló: ${snapshotResult.detail}`);
          }
        }
      }
    }
  }

  revalidatePath("/dashboard/proyectos");
  redirect(`/dashboard/proyectos/${project.id}/agente?created=1`);
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
