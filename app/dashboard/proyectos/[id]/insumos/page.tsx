import { AlertOctagon, PackageSearch } from "lucide-react";
import { Topbar } from "@/components/dashboard/Topbar";
import {
  AvailabilityBadge,
  CriticalityBadge,
  SupplyTypeBadge,
} from "@/components/dashboard/SupplyBadges";
import { getDisplayAgentCounts } from "@/lib/agent-snapshot";
import { getAgentOverrunSnapshot, getDashboardData } from "@/lib/dashboard-data";
import { fmtCOP, fmtCOPCompact, fmtDate, fmtNumber, fmtPercent } from "@/lib/format";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface InsumosPageProps {
  params: Promise<{ id: string }>;
}

type DemoCatalogRow = {
  id: string;
  nombre: string;
  tipo: string;
  unidad_medida: string;
  precio_referencia: number;
  precio_actual: number;
  variacion_precio_pct: number;
  fecha_precio_actualizacion: string | null;
  disponibilidad: "disponible" | "escaso" | "agotado" | "descontinuado";
  es_critico: boolean;
  exposicion_presupuestal: number;
  cantidad_planeada_total: number;
  cantidad_ejecutada_total: number;
  ordenes_pendientes: number;
  proyectos_impactados: number;
};

export default async function InsumosPage({ params }: InsumosPageProps) {
  const { id: projectId } = await params;
  const [dashboardData, agentSnapshot, t] = await Promise.all([
    getDashboardData(projectId),
    getAgentOverrunSnapshot(projectId),
    getDictionary(projectId),
  ]);
  const { totals, alerts, topCriticalSupplies } = dashboardData;
  const locale = t.locale;
  const supplies = buildCatalogRows(alerts, topCriticalSupplies);
  const displayCounts = getDisplayAgentCounts(agentSnapshot);
  const desviacion = getDesviacion(agentSnapshot);

  return (
    <>
      <Topbar
        title="Critical supplies"
        subtitle="Catalog, budget exposure, availability, and monitored market price variation."
      />

      <div className="space-y-8 px-5 py-8 sm:px-8">
        <section className="grid gap-4 sm:grid-cols-3">
          <SummaryTile
            label="Supplies in catalog"
            value={String(supplies.length)}
            hint={`${topCriticalSupplies.length} marked as critical`}
          />
          <SummaryTile
            label="Critical in alert"
            value={String(totals.insumos_criticos_alerta)}
            hint="Scarce, exhausted, or discontinued"
            tone={totals.insumos_criticos_alerta > 0 ? "risk" : "ok"}
          />
          <SummaryTile
            label="Critical budget exposure"
            value={fmtCOP(totals.exposicion_critica)}
            hint="UPA subtotal dependent on critical supplies"
          />
        </section>

        <section className="rounded-2xl border border-line bg-canvas-raised">
          <header className="border-b border-line px-5 py-4">
            <h2 className="font-display text-xl text-ink">Critical supplies agent</h2>
            <p className="mt-0.5 text-xs text-ink-soft">
              Automatic monitoring of prices, forecast points, and cost-risk alerts.
            </p>
          </header>

          {!agentSnapshot || !agentSnapshot.last_run_id ? (
            <div className="px-5 py-5 text-sm text-ink-muted">
              No run has been recorded yet. Creating or updating onboarding triggers the agent automatically.
            </div>
          ) : (
            <div className="space-y-4 px-5 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <AgentRunStatusBadge status={agentSnapshot.last_run_status} />
                <span className="text-xs text-ink-soft">
                  Start {fmtDate(agentSnapshot.last_run_started_at, locale)} · End{" "}
                  {fmtDate(agentSnapshot.last_run_finished_at, locale)}
                </span>
              </div>

              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <MetricCell
                  label="Targeted supplies"
                  value={fmtNumber(agentSnapshot.supplies_targeted, { decimals: 0 })}
                />
                <MetricCell
                  label="Scrape OK"
                  value={fmtNumber(agentSnapshot.supplies_scraped_ok, { decimals: 0 })}
                />
                <MetricCell
                  label="Scrape failed"
                  value={fmtNumber(agentSnapshot.supplies_scraped_failed, { decimals: 0 })}
                />
                <MetricCell
                  label="Forecast points"
                  value={fmtNumber(displayCounts.forecastPointsWritten, { decimals: 0 })}
                />
                <MetricCell
                  label="Alerts triggered"
                  value={fmtNumber(displayCounts.alertsTriggered, { decimals: 0 })}
                />
              </dl>

              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCell
                  label="Baseline budget"
                  value={fmtCOP(agentSnapshot.baseline_budget)}
                />
                <MetricCell
                  label="Projected cost"
                  value={fmtCOP(agentSnapshot.projected_total_cost)}
                />
                <MetricCell
                  label="Deviation"
                  value={`${fmtSignedCOP(desviacion.amount)} · ${fmtSignedPercent(desviacion.pct)}`}
                />
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-canvas-raised">
          <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 className="font-display text-xl text-ink">Catalog</h2>
              <p className="mt-0.5 text-xs text-ink-soft">
                Critical supplies generate automatic alerts and prioritize purchase-order lines.
              </p>
            </div>
            <PackageSearch
              aria-hidden="true"
              className="hidden h-5 w-5 text-ink-soft sm:block"
            />
          </header>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] font-medium uppercase tracking-[0.12em] text-ink-soft">
                  <th scope="col" className="px-5 py-3">Supply</th>
                  <th scope="col" className="px-5 py-3">Type</th>
                  <th scope="col" className="px-5 py-3">Criticality</th>
                  <th scope="col" className="px-5 py-3">Availability</th>
                  <th scope="col" className="px-5 py-3 text-right">Base price</th>
                  <th scope="col" className="px-5 py-3 text-right">Market price</th>
                  <th scope="col" className="px-5 py-3 text-right">Variation</th>
                  <th scope="col" className="px-5 py-3 text-right">Exposure</th>
                  <th scope="col" className="px-5 py-3 text-right">Exec. / plan.</th>
                  <th scope="col" className="px-5 py-3 text-right">Open POs</th>
                </tr>
              </thead>
              <tbody>
                {supplies.map((s) => {
                  const consumo = s.cantidad_planeada_total > 0
                    ? (s.cantidad_ejecutada_total / s.cantidad_planeada_total) * 100
                    : 0;
                  const isAlert = s.es_critico && s.disponibilidad !== "disponible";
                  return (
                    <tr
                      key={s.id}
                      className={`border-b border-line/70 transition-colors ${
                        isAlert ? "bg-status-risk/[0.03]" : "hover:bg-ink/[0.02]"
                      }`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-2">
                          {isAlert ? (
                            <AlertOctagon
                              aria-label="In alert"
                              className="mt-0.5 h-4 w-4 shrink-0 text-status-risk"
                            />
                          ) : null}
                          <div>
                            <p className="font-medium text-ink">
                              {translateDemoSupplyName(s.nombre, locale)}
                            </p>
                            <p className="text-[11px] text-ink-soft">
                              Unit: {s.unidad_medida}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <SupplyTypeBadge type={s.tipo} locale={locale} />
                      </td>
                      <td className="px-5 py-4">
                        <CriticalityBadge critical={s.es_critico} />
                      </td>
                      <td className="px-5 py-4">
                        <AvailabilityBadge value={s.disponibilidad} locale={locale} />
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-ink">
                        {fmtCOP(s.precio_referencia)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-ink">
                        {fmtCOP(s.precio_actual)}
                        <p className="text-[11px] font-sans text-ink-soft">
                          {s.fecha_precio_actualizacion
                            ? fmtDate(s.fecha_precio_actualizacion, locale)
                            : "No load"}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                            s.variacion_precio_pct >= 10
                              ? "bg-status-risk/10 text-status-risk"
                              : s.variacion_precio_pct >= 5
                                ? "bg-status-warn/10 text-status-warn"
                                : s.variacion_precio_pct > 0
                                  ? "bg-status-ok/10 text-status-ok"
                                  : "bg-ink/5 text-ink-soft"
                          }`}
                        >
                          {fmtPercent(s.variacion_precio_pct, { decimals: 1 })}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-ink">
                        {fmtCOPCompact(s.exposicion_presupuestal)}
                        <p className="text-[11px] font-sans text-ink-soft">
                          {s.proyectos_impactados} project
                          {s.proyectos_impactados === 1 ? "" : "s"}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <p className="font-mono text-ink">
                          {fmtNumber(s.cantidad_ejecutada_total)} /{" "}
                          {fmtNumber(s.cantidad_planeada_total)}
                        </p>
                        <p className="text-[11px] text-ink-soft">
                          {s.cantidad_planeada_total > 0
                            ? `${consumo.toFixed(0)}% executed`
                            : "No UPA"}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-ink">
                        {fmtNumber(s.ordenes_pendientes)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-dashed border-line bg-canvas-raised p-6">
          <h3 className="font-display text-lg text-ink">
            Criticality rules
          </h3>
          <ul className="mt-4 grid gap-3 text-sm text-ink-muted sm:grid-cols-3">
            <li className="rounded-xl border border-line bg-canvas p-4">
              <span className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                Automatic trigger
              </span>
              <p className="mt-1.5 text-ink">
                If a critical supply becomes <strong>scarce</strong>,{" "}
                <strong>exhausted</strong>, or <strong>discontinued</strong>, a
                single alert is opened for that supply.
              </p>
            </li>
            <li className="rounded-xl border border-line bg-canvas p-4">
              <span className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                Purchasing
              </span>
              <p className="mt-1.5 text-ink">
                Purchase-order lines with critical supplies are marked as{" "}
                <strong>priority</strong> automatically when inserted or updated.
              </p>
            </li>
            <li className="rounded-xl border border-line bg-canvas p-4">
              <span className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                Resolution
              </span>
              <p className="mt-1.5 text-ink">
                When availability returns to <strong>available</strong>, the
                alert is closed and marked <strong>resolved</strong>.
              </p>
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}

function toNumericOrNull(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
}

function getDesviacion(
  snapshot: Awaited<ReturnType<typeof getAgentOverrunSnapshot>>,
): { amount: number | null; pct: number | null } {
  const baseline = toNumericOrNull(snapshot?.baseline_budget);
  const projected = toNumericOrNull(snapshot?.projected_total_cost);

  if (baseline != null && projected != null && baseline > 0) {
    const amount = projected - baseline;
    const pct = (amount / baseline) * 100;
    return { amount, pct };
  }

  const overrunAmount = toNumericOrNull(snapshot?.overrun_amount);
  const overrunPct = toNumericOrNull(snapshot?.overrun_pct);
  return {
    amount: overrunAmount,
    pct: overrunPct,
  };
}

function fmtSignedCOP(value: number | null): string {
  if (value == null) return "—";
  if (value > 0) return `+ ${fmtCOP(Math.abs(value))}`;
  if (value < 0) return `- ${fmtCOP(Math.abs(value))}`;
  return fmtCOP(0);
}

function fmtSignedPercent(value: number | null): string {
  if (value == null) return "—";
  if (value > 0) return `+${fmtPercent(Math.abs(value), { decimals: 2 })}`;
  if (value < 0) return `-${fmtPercent(Math.abs(value), { decimals: 2 })}`;
  return fmtPercent(0, { decimals: 2 });
}

function SummaryTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "ok" | "risk";
}) {
  const accent =
    tone === "risk"
      ? "border-status-risk/30 bg-status-risk/5"
      : tone === "ok"
        ? "border-status-ok/30 bg-status-ok/5"
        : "border-line bg-canvas-raised";
  return (
    <div className={`rounded-2xl border p-5 ${accent}`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-muted">{hint}</p>
    </div>
  );
}

function AgentRunStatusBadge({ status }: { status: string | null }) {
  const tone =
    status === "completed"
      ? "bg-status-ok/10 text-status-ok"
      : status === "partial"
        ? "bg-status-warn/10 text-status-warn"
        : status === "failed"
          ? "bg-status-risk/10 text-status-risk"
          : "bg-ink/5 text-ink-soft";

  const label =
    status === "completed"
      ? "Completed"
      : status === "partial"
        ? "Partial"
        : status === "failed"
          ? "Failed"
          : "No status";

  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${tone}`}>
      Run {label}
    </span>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-canvas px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">{label}</p>
      <p className="mt-1 font-mono text-sm text-ink">{value}</p>
    </div>
  );
}

function buildCatalogRows(
  alerts: Array<{
    alert_id: string;
    nombre: string;
    tipo: string;
    disponibilidad: string;
    exposicion: number;
  }>,
  topCriticalSupplies: Array<{
    id: string;
    nombre: string;
    tipo: string;
    unidad_medida: string;
    precio_referencia: number;
    precio_actual: number;
    variacion_precio_pct: number;
    fecha_precio_actualizacion: string | null;
    disponibilidad: "disponible" | "escaso" | "agotado" | "descontinuado";
    exposicion_presupuestal: number;
    cantidad_planeada_total: number;
    cantidad_ejecutada_total: number;
    ordenes_pendientes: number;
    proyectos_impactados: number;
  }>,
): DemoCatalogRow[] {
  const rows = new Map<string, DemoCatalogRow>();

  for (const alert of alerts.slice(0, 6)) {
    rows.set(`alert:${alert.alert_id}`, {
      id: `alert:${alert.alert_id}`,
      nombre: alert.nombre,
      tipo: alert.tipo,
      unidad_medida: "lot",
      precio_referencia: 0,
      precio_actual: 0,
      variacion_precio_pct: 0,
      fecha_precio_actualizacion: null,
      disponibilidad: normalizeAvailability(alert.disponibilidad),
      es_critico: true,
      exposicion_presupuestal: alert.exposicion,
      cantidad_planeada_total: 0,
      cantidad_ejecutada_total: 0,
      ordenes_pendientes: 0,
      proyectos_impactados: 1,
    });
  }

  for (const supply of topCriticalSupplies) {
    rows.set(`supply:${supply.id}`, {
      ...supply,
      id: `supply:${supply.id}`,
      es_critico: true,
    });
  }

  return Array.from(rows.values());
}

function normalizeAvailability(value: string): "disponible" | "escaso" | "agotado" | "descontinuado" {
  switch (value) {
    case "agotado":
    case "descontinuado":
    case "escaso":
      return value;
    default:
      return "escaso";
  }
}

function translateDemoSupplyName(name: string, locale: string): string {
  if (!locale.toLowerCase().startsWith("en")) return name;
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

  const exactMap: Record<string, string> = {
    "HABITACIONES Y PASILLOS": "ROOMS AND CORRIDORS",
    "ELEMENTOS ARQUITECTONICOS": "ARCHITECTURAL ELEMENTS",
    "INSTALACIONES ELECTRICAS": "ELECTRICAL INSTALLATIONS",
    "ILUMINACION": "LIGHTING",
    "CARPINTERIA METALICA - ALUMINIO - PVC - VIDRIO - INOX": "METAL CARPENTRY - ALUMINUM - PVC - GLASS - STAINLESS",
    "FANCOIL HIDRONICO TIPO PARED LUJO MARCA YORK A 220V DE 12.000BTU INCLUYE VALVULA DE 3 VIAS MODELO YHGW04CDT-M-RX":
      "HYDRONIC WALL FAN COIL YORK 220V 12,000 BTU WITH 3-WAY VALVE MODEL YHGW04CDT-M-RX",
  };

  if (exactMap[normalized]) return exactMap[normalized];

  const prefixMap: Array<[string, string]> = [
    [
      "S/I CIELO RASO EN LAMINA FIBROCEMENTO",
      "Drywall ceiling in fiber cement board 6 mm. Includes structure and first-coat paint. Floors 5 and 4.",
    ],
    [
      "S/I TABLERO ELECTRICO BIFASICO",
      "Two-phase electrical panel for 12 circuits with space for totalizer. Includes breakers and accessories.",
    ],
    [
      "S/I DIVISION PARA BANO EN VIDRIO TEMPLADO",
      "Tempered glass bathroom partition E:8 mm. Includes door leaf, fixed panel, and hardware.",
    ],
    [
      "S/I PARCIAL DESDE TABLEROS DE DISTRIBUCION DE PISO 5 HASTA TABLEROS DE HABITACIONES",
      "Partial run from floor 5 distribution panels to room panels. Includes wiring and conduit.",
    ],
    [
      "S/I PARCIAL DESDE TABLERO PRINCIPAL DE PISO 5 HASTA TABLEROS DE DISTRIBUCION DE TORRES A Y B",
      "Partial run from floor 5 main panel to Towers A and B distribution panels. Includes wiring.",
    ],
    [
      "S/I TABLERO ELECTRICO TRIFASICO",
      "Three-phase electrical panel for 24 circuits with space for totalizer. Includes breakers and accessories.",
    ],
    [
      "S/I PORCELANATO REF. CELLER IN&OUT",
      "Porcelain tile ref. Celler in&out, 60x60 cm, white, Alfa brand, for rooms and bathroom areas.",
    ],
    [
      "S/I ESTUCO Y PINTURA CIELO RASOS Y TECHOS 3MANOS",
      "Stucco and paint for ceilings and roof slabs, 3 coats, including linear details and technical rooms.",
    ],
  ];

  for (const [prefix, translation] of prefixMap) {
    if (normalized.startsWith(prefix)) return translation;
  }

  return name;
}
