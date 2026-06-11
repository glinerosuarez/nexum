import { buildProjectionCurve, type CurveData } from "@/lib/curve";
import {
  isUnauthorizedProjectAccessError,
  nexumApiRequest,
} from "@/lib/nexum-api/client";

export interface ProjectSummary {
  id: string;
  nombre: string;
  estado: string;
  idioma: string;
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
  precio_actual: number;
  variacion_precio_abs: number;
  variacion_precio_pct: number;
  tiene_actualizacion_precio: boolean;
  fecha_precio_actualizacion: string | null;
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
  priceRisk: PriceRiskSummary;
  alerts: CriticalAlertRow[];
  topCriticalSupplies: SupplyRow[];
  curva: CurveData | null;
}

export interface PriceRiskRow {
  supply_id: string;
  nombre: string;
  tipo: string;
  unidad_medida: string;
  cantidad_planeada_total: number;
  baseline_unit_price: number;
  current_unit_price: number;
  unit_price_change_pct: number;
  baseline_amount: number;
  projected_amount: number;
  impact_amount: number;
  severity: "ok" | "warn" | "critical";
}

export interface PriceRiskSummary {
  hasPriceUpdates: boolean;
  lastUpdateDate: string | null;
  changedSupplies: number;
  suppliesAtRisk: number;
  criticalSupplies: number;
  affectedBudget: number;
  projectedAdditionalCost: number;
  projectedBudget: number;
  projectedOverrunAmount: number;
  projectedOverrunPercent: number;
  severity: "ok" | "warn" | "critical";
  topImpacts: PriceRiskRow[];
}

export interface ProjectListRow {
  id: string;
  nombre: string;
  descripcion: string | null;
  ubicacion: string | null;
  estado: string;
  fecha_inicio_planeada: string | null;
  fecha_fin_planeada: string | null;
  fecha_inicio_real: string | null;
  idioma: string;
  presupuesto_total: number;
  gasto_ejecutado: number;
  avance: number;
  spi: number | null;
  cpi: number | null;
  incidentes_abiertos: number;
  created_at: string;
}

export interface PriceBatchListRow {
  id: string;
  source_file_name: string;
  observed_at: string;
  created_at: string;
  total_rows: number;
  matched_rows: number;
  unmatched_rows: number;
}

export interface AgentOverrunSnapshot {
  project_id: string;
  project_nombre: string;
  last_run_id: string | null;
  last_run_mode: string | null;
  last_run_status: string | null;
  last_run_started_at: string | null;
  last_run_finished_at: string | null;
  supplies_targeted: number;
  supplies_scraped_ok: number;
  supplies_scraped_failed: number;
  forecast_points_written: number;
  alerts_triggered: number;
  error_summary: string | null;
  last_alert_id: string | null;
  last_alert_severity: string | null;
  last_alert_status: string | null;
  last_alert_triggered_at: string | null;
  baseline_budget: number;
  projected_total_cost: number;
  overrun_amount: number;
  overrun_pct: number;
  threshold_pct: number;
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

export interface ProjectBasic {
  id: string;
  nombre: string;
  idioma: string;
}

export interface SupplySelectionInputDocument {
  id: string;
  filename: string;
  source: string;
  parse_status: string;
  confidence: string;
  content_hash: string;
  extracted_row_count: number;
  sheet_names: string[];
  created_at: string;
}

export interface SupplySelectionInputBatch {
  id: string;
  project_id: string | null;
  created_by_profile_id: string;
  status: string;
  merged_preview: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SupplySelectionNormalizedSupply {
  id: string;
  normalization_key: string;
  display_name: string;
  normalized_name: string;
  normalized_unit: string | null;
  normalized_category: string;
  quantity_total: number | null;
  unit_price_reference: number | null;
  total_price_reference: number | null;
  row_count: number;
  source_count: number;
  source_document_ids: string[];
  extracted_row_ids: string[];
}

export interface SupplySelectionInputsPayload {
  batch: SupplySelectionInputBatch | null;
  documents: SupplySelectionInputDocument[];
  normalized_supplies: SupplySelectionNormalizedSupply[];
  row_counts?: {
    document_count?: number;
    extracted_row_count?: number;
    normalized_supply_count?: number;
    row_normalization_count?: number;
  };
}

interface CurveSourcePhase {
  nombre: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  costo_planeado: number;
  costo_real: number;
  porcentaje_completado: number;
}

interface CurveSourcePayload {
  projectStart: string | null;
  projectEnd: string | null;
  totalBudget: number;
  totalActualCost: number;
  phases: CurveSourcePhase[];
}

function withQuery(path: string, query: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export async function getDashboardData(projectId?: string): Promise<DashboardData> {
  const path = withQuery("/dashboard/summary", { project_id: projectId ?? null });
  const data = await nexumApiRequest<DashboardData>(path);

  const effectiveProjectId = data.project?.id ?? projectId ?? null;
  if (!effectiveProjectId || data.curva) {
    return data;
  }

  try {
    const curveSource = await nexumApiRequest<CurveSourcePayload>(
      `/projects/${encodeURIComponent(effectiveProjectId)}/curve-source`,
    );

    const curva = buildProjectionCurve({
      phases: curveSource.phases.map((phase) => ({
        nombre: phase.nombre,
        fecha_inicio: phase.fecha_inicio,
        fecha_fin: phase.fecha_fin,
        costo_planeado: Number(phase.costo_planeado ?? 0),
        costo_real: Number(phase.costo_real ?? 0),
        porcentaje_completado: Number(phase.porcentaje_completado ?? 0),
      })),
      projectStart: curveSource.projectStart,
      projectEnd: curveSource.projectEnd,
      totalBudget: Number(curveSource.totalBudget ?? 0),
      totalActualCost: Number(curveSource.totalActualCost ?? 0),
    });

    return { ...data, curva };
  } catch {
    return data;
  }
}

export async function getAllSupplies(projectId?: string): Promise<SupplyRow[]> {
  const path = projectId
    ? `/projects/${encodeURIComponent(projectId)}/supplies`
    : "/supplies";
  return nexumApiRequest<SupplyRow[]>(path);
}

export async function getRecentPriceBatches(limit = 12): Promise<PriceBatchListRow[]> {
  const path = withQuery("/supplies/price-batches", { limit });
  return nexumApiRequest<PriceBatchListRow[]>(path);
}

export async function getAgentOverrunSnapshot(
  projectId: string,
): Promise<AgentOverrunSnapshot | null> {
  const path = `/projects/${encodeURIComponent(projectId)}/agent-overrun-snapshot`;
  const payload = await nexumApiRequest<{ snapshot: AgentOverrunSnapshot | null }>(path);
  return payload.snapshot;
}

export async function getCostsData(projectId?: string): Promise<CostsData> {
  const path = projectId
    ? `/projects/${encodeURIComponent(projectId)}/costs`
    : "/costs/summary";
  return nexumApiRequest<CostsData>(path);
}

export async function getProfileInfo(userId: string) {
  const path = withQuery("/profiles/me", { user_id: userId });
  return nexumApiRequest<{ id: string; full_name: string | null; email: string | null; job_title: string | null } | null>(path);
}

export async function listProjects(): Promise<ProjectListRow[]> {
  return nexumApiRequest<ProjectListRow[]>("/projects");
}

export async function getProjectBasic(projectId: string): Promise<ProjectBasic | null> {
  const path = `/projects/${encodeURIComponent(projectId)}/basic`;
  try {
    const payload = await nexumApiRequest<{ project: ProjectBasic | null }>(path);
    return payload.project;
  } catch (error) {
    if (isUnauthorizedProjectAccessError(error)) {
      return null;
    }
    throw error;
  }
}

export async function getSupplySelectionInputs(
  projectId: string,
): Promise<SupplySelectionInputsPayload | null> {
  const path = `/projects/${encodeURIComponent(projectId)}/supply-selection-inputs`;
  return nexumApiRequest<SupplySelectionInputsPayload>(path);
}

export async function projectExists(projectId: string): Promise<boolean> {
  const path = `/projects/${encodeURIComponent(projectId)}/exists`;
  const payload = await nexumApiRequest<{ exists: boolean }>(path);
  return payload.exists;
}
