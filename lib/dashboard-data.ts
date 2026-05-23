import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toNumber } from "@/lib/format";

export interface ProjectSummary {
  id: string;
  nombre: string;
  estado: string;
  avance_global_percent: number;
  avance_planeado_percent: number | null;
  presupuesto_total: number;
  gasto_ejecutado: number;
  spi: number | null;
  cpi: number | null;
  incidentes_abiertos: number;
}

export interface SupplyRow {
  id: string;
  nombre: string;
  tipo: string;
  unidad_medida: string;
  precio_referencia: number;
  disponibilidad: "disponible" | "escaso" | "agotado" | "descontinuado";
  es_critico: boolean;
  exposicion_presupuestal: number;
  cantidad_planeada_total: number;
  cantidad_ejecutada_total: number;
  ordenes_pendientes: number;
  proyectos_impactados: number;
}

export interface CriticalAlertRow {
  alert_id: string;
  supply_id: string;
  nombre: string;
  tipo: string;
  disponibilidad: string;
  mensaje: string;
  abierta_desde: string;
  exposicion: number;
}

export interface PurchaseOrderRow {
  id: string;
  order_number: string;
  estado: string;
  fecha_emision: string;
  fecha_entrega_esperada: string | null;
  supplier_nombre: string;
  total: number;
  prioritario: boolean;
  pagado: number;
  saldo: number;
  items_count: number;
}

export interface BudgetByPhase {
  phase_id: string;
  nombre: string;
  presupuesto: number;
  ejecutado_aprox: number;
  avance_promedio: number;
}

export interface DashboardData {
  project: ProjectSummary | null;
  totals: {
    presupuesto_total: number;
    gasto_ejecutado: number;
    avance: number;
    incidentes_abiertos: number;
    insumos_criticos_alerta: number;
    exposicion_critica: number;
    ordenes_prioritarias: number;
    saldo_por_pagar: number;
    nomina_pagada: number;
  };
  alerts: CriticalAlertRow[];
  topCriticalSupplies: SupplyRow[];
}

interface SupplyAggregations {
  exposicionPorSupply: Map<string, number>;
  cantidadPlaneada: Map<string, number>;
  cantidadEjecutada: Map<string, number>;
  proyectosPorSupply: Map<string, Set<string>>;
  ordenesPendientesPorSupply: Map<string, number>;
}

async function getSupplyAggregations(): Promise<SupplyAggregations> {
  const supabase = await createSupabaseServerClient();

  const exposicionPorSupply = new Map<string, number>();
  const cantidadPlaneada = new Map<string, number>();
  const cantidadEjecutada = new Map<string, number>();
  const proyectosPorSupply = new Map<string, Set<string>>();
  const ordenesPendientesPorSupply = new Map<string, number>();

  const { data: activitySupplies } = await supabase
    .from("activity_supplies")
    .select(
      "supply_id, cantidad_planeada, cantidad_ejecutada, precio_unitario, subtotal, activities!inner(phase_id, project_phases!inner(project_id))",
    );

  type ActivitySupplyRow = {
    supply_id: string;
    cantidad_planeada: number | string;
    cantidad_ejecutada: number | string;
    precio_unitario: number | string;
    subtotal: number | string | null;
    activities:
      | {
          phase_id: string;
          project_phases:
            | { project_id: string }
            | { project_id: string }[]
            | null;
        }
      | {
          phase_id: string;
          project_phases:
            | { project_id: string }
            | { project_id: string }[]
            | null;
        }[]
      | null;
  };

  for (const item of (activitySupplies ?? []) as ActivitySupplyRow[]) {
    const supplyId = item.supply_id;
    const subtotal =
      toNumber(item.subtotal) ||
      toNumber(item.cantidad_planeada) * toNumber(item.precio_unitario);

    exposicionPorSupply.set(
      supplyId,
      (exposicionPorSupply.get(supplyId) ?? 0) + subtotal,
    );
    cantidadPlaneada.set(
      supplyId,
      (cantidadPlaneada.get(supplyId) ?? 0) + toNumber(item.cantidad_planeada),
    );
    cantidadEjecutada.set(
      supplyId,
      (cantidadEjecutada.get(supplyId) ?? 0) +
        toNumber(item.cantidad_ejecutada),
    );

    const activityField = Array.isArray(item.activities)
      ? item.activities[0]
      : item.activities;
    const phasesField = activityField?.project_phases;
    const phasesArray = Array.isArray(phasesField)
      ? phasesField
      : phasesField
        ? [phasesField]
        : [];
    for (const phase of phasesArray) {
      if (!phase?.project_id) continue;
      if (!proyectosPorSupply.has(supplyId)) {
        proyectosPorSupply.set(supplyId, new Set());
      }
      proyectosPorSupply.get(supplyId)!.add(phase.project_id);
    }
  }

  const { data: pendingItems } = await supabase
    .from("purchase_order_items")
    .select(
      "supply_id, cantidad, purchase_orders!inner(estado)",
    );

  type PendingItemRow = {
    supply_id: string;
    cantidad: number | string;
    purchase_orders:
      | { estado: string }
      | { estado: string }[]
      | null;
  };

  for (const item of (pendingItems ?? []) as PendingItemRow[]) {
    const poField = Array.isArray(item.purchase_orders)
      ? item.purchase_orders[0]
      : item.purchase_orders;
    if (!poField) continue;
    if (poField.estado === "recibida" || poField.estado === "cancelada") continue;
    ordenesPendientesPorSupply.set(
      item.supply_id,
      (ordenesPendientesPorSupply.get(item.supply_id) ?? 0) +
        toNumber(item.cantidad),
    );
  }

  return {
    exposicionPorSupply,
    cantidadPlaneada,
    cantidadEjecutada,
    proyectosPorSupply,
    ordenesPendientesPorSupply,
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createSupabaseServerClient();

  const { data: projectRow } = await supabase
    .from("management_report_data")
    .select("*")
    .order("project_nombre", { ascending: true })
    .limit(1)
    .maybeSingle();

  let project: ProjectSummary | null = null;
  if (projectRow && projectRow.project_id && projectRow.project_nombre) {
    project = {
      id: projectRow.project_id,
      nombre: projectRow.project_nombre,
      estado: projectRow.estado ?? "—",
      avance_global_percent: toNumber(projectRow.avance_global_percent),
      avance_planeado_percent: projectRow.avance_planeado_percent != null
        ? toNumber(projectRow.avance_planeado_percent)
        : null,
      presupuesto_total: toNumber(projectRow.presupuesto_total),
      gasto_ejecutado: toNumber(projectRow.gasto_ejecutado),
      spi: projectRow.spi_basico != null ? toNumber(projectRow.spi_basico) : null,
      cpi: projectRow.cpi_basico != null ? toNumber(projectRow.cpi_basico) : null,
      incidentes_abiertos: toNumber(projectRow.incidentes_abiertos, 0),
    };
  }

  const agg = await getSupplyAggregations();

  const { data: supplyRows } = await supabase
    .from("supply_catalog")
    .select(
      "id, nombre, tipo, unidad_medida, precio_referencia, disponibilidad, es_critico",
    )
    .eq("activo", true);

  const supplies: SupplyRow[] = (supplyRows ?? []).map((s) => ({
    id: s.id,
    nombre: s.nombre,
    tipo: s.tipo,
    unidad_medida: s.unidad_medida,
    precio_referencia: toNumber(s.precio_referencia),
    disponibilidad: s.disponibilidad,
    es_critico: s.es_critico,
    exposicion_presupuestal: agg.exposicionPorSupply.get(s.id) ?? 0,
    cantidad_planeada_total: agg.cantidadPlaneada.get(s.id) ?? 0,
    cantidad_ejecutada_total: agg.cantidadEjecutada.get(s.id) ?? 0,
    ordenes_pendientes: agg.ordenesPendientesPorSupply.get(s.id) ?? 0,
    proyectos_impactados: agg.proyectosPorSupply.get(s.id)?.size ?? 0,
  }));

  const { data: alertRows } = await supabase
    .from("supply_availability_alerts")
    .select(
      "id, supply_id, disponibilidad, mensaje, created_at, supply_catalog!inner(nombre, tipo, es_critico)",
    )
    .eq("estado", "abierta")
    .order("created_at", { ascending: false });

  type AlertRow = {
    id: string;
    supply_id: string;
    disponibilidad: string;
    mensaje: string;
    created_at: string;
    supply_catalog:
      | { nombre: string; tipo: string; es_critico: boolean }
      | { nombre: string; tipo: string; es_critico: boolean }[]
      | null;
  };

  const alerts: CriticalAlertRow[] = ((alertRows ?? []) as AlertRow[]).map(
    (row) => {
      const sc = Array.isArray(row.supply_catalog)
        ? row.supply_catalog[0]
        : row.supply_catalog;
      return {
        alert_id: row.id,
        supply_id: row.supply_id,
        nombre: sc?.nombre ?? "Insumo",
        tipo: sc?.tipo ?? "—",
        disponibilidad: row.disponibilidad,
        mensaje: row.mensaje,
        abierta_desde: row.created_at,
        exposicion: agg.exposicionPorSupply.get(row.supply_id) ?? 0,
      };
    },
  );

  const topCriticalSupplies = supplies
    .filter((s) => s.es_critico)
    .sort((a, b) => b.exposicion_presupuestal - a.exposicion_presupuestal)
    .slice(0, 6);

  const { data: poItems } = await supabase
    .from("purchase_order_items")
    .select("subtotal, cantidad, precio_unitario, es_prioritario, purchase_order_id");

  type POItemRow = {
    subtotal: number | string | null;
    cantidad: number | string;
    precio_unitario: number | string;
    es_prioritario: boolean;
    purchase_order_id: string;
  };

  const poTotals = new Map<string, number>();
  let ordenesPrioritariasMontoBruto = 0;
  for (const it of (poItems ?? []) as POItemRow[]) {
    const value =
      toNumber(it.subtotal) ||
      toNumber(it.cantidad) * toNumber(it.precio_unitario);
    poTotals.set(
      it.purchase_order_id,
      (poTotals.get(it.purchase_order_id) ?? 0) + value,
    );
    if (it.es_prioritario) ordenesPrioritariasMontoBruto += value;
  }

  const { data: payments } = await supabase
    .from("supplier_payments")
    .select("monto, estado, purchase_order_id");

  type PayRow = {
    monto: number | string;
    estado: string;
    purchase_order_id: string;
  };

  let saldoPorPagar = 0;
  const pagosPorPO = new Map<string, number>();
  for (const p of (payments ?? []) as PayRow[]) {
    if (p.estado === "pagado") {
      pagosPorPO.set(
        p.purchase_order_id,
        (pagosPorPO.get(p.purchase_order_id) ?? 0) + toNumber(p.monto),
      );
    } else if (p.estado === "pendiente") {
      saldoPorPagar += toNumber(p.monto);
    }
  }

  const { data: payroll } = await supabase
    .from("payroll_entries")
    .select("total_neto, salario_base, deducciones, bonificaciones");

  type PayrollRow = {
    total_neto: number | string | null;
    salario_base: number | string | null;
    deducciones: number | string | null;
    bonificaciones: number | string | null;
  };

  let nominaPagada = 0;
  for (const e of (payroll ?? []) as PayrollRow[]) {
    nominaPagada +=
      toNumber(e.total_neto) ||
      toNumber(e.salario_base) -
        toNumber(e.deducciones) +
        toNumber(e.bonificaciones);
  }

  const totalsPresupuesto = project?.presupuesto_total ?? 0;
  const totalsGasto = project?.gasto_ejecutado ?? 0;

  return {
    project,
    totals: {
      presupuesto_total: totalsPresupuesto,
      gasto_ejecutado: totalsGasto,
      avance: project?.avance_global_percent ?? 0,
      incidentes_abiertos: project?.incidentes_abiertos ?? 0,
      insumos_criticos_alerta: alerts.length,
      exposicion_critica: alerts.reduce((acc, a) => acc + a.exposicion, 0),
      ordenes_prioritarias: ordenesPrioritariasMontoBruto,
      saldo_por_pagar: saldoPorPagar,
      nomina_pagada: nominaPagada,
    },
    alerts,
    topCriticalSupplies,
  };
}

export async function getAllSupplies(): Promise<SupplyRow[]> {
  const supabase = await createSupabaseServerClient();
  const agg = await getSupplyAggregations();

  const { data: rows } = await supabase
    .from("supply_catalog")
    .select(
      "id, nombre, tipo, unidad_medida, precio_referencia, disponibilidad, es_critico",
    )
    .eq("activo", true)
    .order("es_critico", { ascending: false })
    .order("nombre", { ascending: true });

  return (rows ?? []).map((s) => ({
    id: s.id,
    nombre: s.nombre,
    tipo: s.tipo,
    unidad_medida: s.unidad_medida,
    precio_referencia: toNumber(s.precio_referencia),
    disponibilidad: s.disponibilidad,
    es_critico: s.es_critico,
    exposicion_presupuestal: agg.exposicionPorSupply.get(s.id) ?? 0,
    cantidad_planeada_total: agg.cantidadPlaneada.get(s.id) ?? 0,
    cantidad_ejecutada_total: agg.cantidadEjecutada.get(s.id) ?? 0,
    ordenes_pendientes: agg.ordenesPendientesPorSupply.get(s.id) ?? 0,
    proyectos_impactados: agg.proyectosPorSupply.get(s.id)?.size ?? 0,
  }));
}

export interface CostsData {
  project: ProjectSummary | null;
  budgetByPhase: BudgetByPhase[];
  purchaseOrders: PurchaseOrderRow[];
  nominaTotal: number;
  pagosProveedores: number;
  pagosPendientes: number;
  ordenesPrioritarias: number;
  gastoPorCategoria: { categoria: string; monto: number }[];
}

export async function getCostsData(): Promise<CostsData> {
  const supabase = await createSupabaseServerClient();

  const { data: projectRow } = await supabase
    .from("management_report_data")
    .select("*")
    .order("project_nombre", { ascending: true })
    .limit(1)
    .maybeSingle();

  let project: ProjectSummary | null = null;
  if (projectRow && projectRow.project_id && projectRow.project_nombre) {
    project = {
      id: projectRow.project_id,
      nombre: projectRow.project_nombre,
      estado: projectRow.estado ?? "—",
      avance_global_percent: toNumber(projectRow.avance_global_percent),
      avance_planeado_percent:
        projectRow.avance_planeado_percent != null
          ? toNumber(projectRow.avance_planeado_percent)
          : null,
      presupuesto_total: toNumber(projectRow.presupuesto_total),
      gasto_ejecutado: toNumber(projectRow.gasto_ejecutado),
      spi: projectRow.spi_basico != null ? toNumber(projectRow.spi_basico) : null,
      cpi: projectRow.cpi_basico != null ? toNumber(projectRow.cpi_basico) : null,
      incidentes_abiertos: toNumber(projectRow.incidentes_abiertos, 0),
    };
  }

  const { data: phaseRows } = await supabase
    .from("project_phases")
    .select(
      "id, nombre, project_id, activities(id, progress_percentage, activity_supplies(subtotal, cantidad_planeada, cantidad_ejecutada, precio_unitario))",
    )
    .order("sort_order", { ascending: true });

  type SupplyMini = {
    subtotal: number | string | null;
    cantidad_planeada: number | string;
    cantidad_ejecutada: number | string;
    precio_unitario: number | string;
  };
  type ActivityMini = {
    id: string;
    progress_percentage: number | string | null;
    activity_supplies: SupplyMini[] | null;
  };
  type PhaseMini = {
    id: string;
    nombre: string;
    project_id: string;
    activities: ActivityMini[] | null;
  };

  const budgetByPhase: BudgetByPhase[] = ((phaseRows ?? []) as PhaseMini[]).map(
    (ph) => {
      let presupuesto = 0;
      let ejecutado = 0;
      let progresoSum = 0;
      const activities = ph.activities ?? [];
      for (const act of activities) {
        const supplies = act.activity_supplies ?? [];
        let actBudget = 0;
        let actExecuted = 0;
        for (const s of supplies) {
          const subtotal =
            toNumber(s.subtotal) ||
            toNumber(s.cantidad_planeada) * toNumber(s.precio_unitario);
          actBudget += subtotal;
          actExecuted += toNumber(s.cantidad_ejecutada) * toNumber(s.precio_unitario);
        }
        presupuesto += actBudget;
        ejecutado += actExecuted;
        progresoSum += toNumber(act.progress_percentage);
      }
      const avg = activities.length > 0 ? progresoSum / activities.length : 0;
      return {
        phase_id: ph.id,
        nombre: ph.nombre,
        presupuesto,
        ejecutado_aprox: ejecutado,
        avance_promedio: Number(avg.toFixed(1)),
      };
    },
  );

  const { data: poRows } = await supabase
    .from("purchase_orders")
    .select(
      "id, order_number, estado, fecha_emision, fecha_entrega_esperada, suppliers(nombre), purchase_order_items(subtotal, cantidad, precio_unitario, es_prioritario), supplier_payments(monto, estado)",
    )
    .order("fecha_emision", { ascending: false });

  type POSubItem = {
    subtotal: number | string | null;
    cantidad: number | string;
    precio_unitario: number | string;
    es_prioritario: boolean;
  };
  type POSubPay = { monto: number | string; estado: string };
  type PORow = {
    id: string;
    order_number: string;
    estado: string;
    fecha_emision: string;
    fecha_entrega_esperada: string | null;
    suppliers: { nombre: string } | { nombre: string }[] | null;
    purchase_order_items: POSubItem[] | null;
    supplier_payments: POSubPay[] | null;
  };

  let ordenesPrioritariasTotal = 0;
  const purchaseOrders: PurchaseOrderRow[] = ((poRows ?? []) as PORow[]).map(
    (po) => {
      const items = po.purchase_order_items ?? [];
      let total = 0;
      let prioritario = false;
      for (const it of items) {
        const v =
          toNumber(it.subtotal) ||
          toNumber(it.cantidad) * toNumber(it.precio_unitario);
        total += v;
        if (it.es_prioritario) prioritario = true;
      }
      let pagado = 0;
      for (const p of po.supplier_payments ?? []) {
        if (p.estado === "pagado") pagado += toNumber(p.monto);
      }
      if (prioritario) ordenesPrioritariasTotal += total;
      const supplierField = Array.isArray(po.suppliers)
        ? po.suppliers[0]
        : po.suppliers;
      return {
        id: po.id,
        order_number: po.order_number,
        estado: po.estado,
        fecha_emision: po.fecha_emision,
        fecha_entrega_esperada: po.fecha_entrega_esperada,
        supplier_nombre: supplierField?.nombre ?? "—",
        total,
        prioritario,
        pagado,
        saldo: Math.max(total - pagado, 0),
        items_count: items.length,
      };
    },
  );

  const { data: paymentsAll } = await supabase
    .from("supplier_payments")
    .select("monto, estado");
  type PayAll = { monto: number | string; estado: string };
  let pagosProveedores = 0;
  let pagosPendientes = 0;
  for (const p of (paymentsAll ?? []) as PayAll[]) {
    if (p.estado === "pagado") pagosProveedores += toNumber(p.monto);
    else if (p.estado === "pendiente") pagosPendientes += toNumber(p.monto);
  }

  const { data: payroll } = await supabase
    .from("payroll_entries")
    .select("total_neto, salario_base, deducciones, bonificaciones");
  type PayrollMini = {
    total_neto: number | string | null;
    salario_base: number | string | null;
    deducciones: number | string | null;
    bonificaciones: number | string | null;
  };
  let nominaTotal = 0;
  for (const e of (payroll ?? []) as PayrollMini[]) {
    nominaTotal +=
      toNumber(e.total_neto) ||
      toNumber(e.salario_base) -
        toNumber(e.deducciones) +
        toNumber(e.bonificaciones);
  }

  const gastoPorCategoria = [
    { categoria: "Proveedores (pagado)", monto: pagosProveedores },
    { categoria: "Nómina", monto: nominaTotal },
    { categoria: "Saldo proveedores pendiente", monto: pagosPendientes },
  ];

  return {
    project,
    budgetByPhase,
    purchaseOrders,
    nominaTotal,
    pagosProveedores,
    pagosPendientes,
    ordenesPrioritarias: ordenesPrioritariasTotal,
    gastoPorCategoria,
  };
}

export async function getProfileInfo(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, job_title")
    .eq("id", userId)
    .maybeSingle();
  return data;
}
