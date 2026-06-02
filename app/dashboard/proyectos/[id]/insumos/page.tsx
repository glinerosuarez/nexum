import { AlertOctagon, PackageSearch } from "lucide-react";
import { Topbar } from "@/components/dashboard/Topbar";
import {
  AvailabilityBadge,
  CriticalityBadge,
  SupplyTypeBadge,
} from "@/components/dashboard/SupplyBadges";
import { getAgentOverrunSnapshot, getAllSupplies } from "@/lib/dashboard-data";
import { fmtCOP, fmtCOPCompact, fmtDate, fmtNumber, fmtPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

interface InsumosPageProps {
  params: Promise<{ id: string }>;
}

export default async function InsumosPage({ params }: InsumosPageProps) {
  const { id: projectId } = await params;
  const supplies = await getAllSupplies(projectId);
  const agentSnapshot = await getAgentOverrunSnapshot(projectId);
  const criticos = supplies.filter((s) => s.es_critico);
  const enAlerta = supplies.filter(
    (s) => s.es_critico && s.disponibilidad !== "disponible",
  );
  const exposicionCritica = criticos.reduce(
    (acc, s) => acc + s.exposicion_presupuestal,
    0,
  );
  const desviacion = getDesviacion(agentSnapshot);

  return (
    <>
      <Topbar
        title="Insumos críticos"
        subtitle="Catálogo, exposición presupuestal, disponibilidad y variación de precios de mercado."
      />

      <div className="space-y-8 px-5 py-8 sm:px-8">
        <section className="grid gap-4 sm:grid-cols-3">
          <SummaryTile
            label="Insumos en catálogo"
            value={String(supplies.length)}
            hint={`${criticos.length} marcados como críticos`}
          />
          <SummaryTile
            label="Críticos en alerta"
            value={String(enAlerta.length)}
            hint="Escasos, agotados o descontinuados"
            tone={enAlerta.length > 0 ? "risk" : "ok"}
          />
          <SummaryTile
            label="Exposición presupuestal crítica"
            value={fmtCOP(exposicionCritica)}
            hint="Subtotal APU dependiente de insumos críticos"
          />
        </section>

        <section className="rounded-2xl border border-line bg-canvas-raised">
          <header className="border-b border-line px-5 py-4">
            <h2 className="font-display text-xl text-ink">Agente de insumos críticos</h2>
            <p className="mt-0.5 text-xs text-ink-soft">
              Monitoreo automático de precios, forecast y alerta de sobrecostos.
            </p>
          </header>

          {!agentSnapshot || !agentSnapshot.last_run_id ? (
            <div className="px-5 py-5 text-sm text-ink-muted">
              Aún no hay corrida registrada. Al crear o actualizar onboarding se dispara una corrida del agente.
            </div>
          ) : (
            <div className="space-y-4 px-5 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <AgentRunStatusBadge status={agentSnapshot.last_run_status} />
                <span className="text-xs text-ink-soft">
                  Inicio {fmtDate(agentSnapshot.last_run_started_at)} · Fin {fmtDate(agentSnapshot.last_run_finished_at)}
                </span>
              </div>

              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <MetricCell
                  label="Insumos objetivo"
                  value={fmtNumber(agentSnapshot.supplies_targeted, { decimals: 0 })}
                />
                <MetricCell
                  label="Scrape OK"
                  value={fmtNumber(agentSnapshot.supplies_scraped_ok, { decimals: 0 })}
                />
                <MetricCell
                  label="Scrape fallidos"
                  value={fmtNumber(agentSnapshot.supplies_scraped_failed, { decimals: 0 })}
                />
                <MetricCell
                  label="Puntos forecast"
                  value={fmtNumber(agentSnapshot.forecast_points_written, { decimals: 0 })}
                />
                <MetricCell
                  label="Alertas disparadas"
                  value={fmtNumber(agentSnapshot.alerts_triggered, { decimals: 0 })}
                />
              </dl>

              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCell
                  label="Budget base"
                  value={fmtCOP(agentSnapshot.baseline_budget)}
                />
                <MetricCell
                  label="Costo proyectado"
                  value={fmtCOP(agentSnapshot.projected_total_cost)}
                />
                <MetricCell
                  label="Desviación"
                  value={`${fmtSignedCOP(desviacion.amount)} · ${fmtSignedPercent(desviacion.pct)}`}
                />
              </div>

              {agentSnapshot.error_summary ? (
                <p className="rounded-xl border border-status-warn/30 bg-status-warn/10 px-3 py-2 text-xs text-status-warn">
                  Último error: {agentSnapshot.error_summary}
                </p>
              ) : null}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-canvas-raised">
          <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 className="font-display text-xl text-ink">Catálogo</h2>
              <p className="mt-0.5 text-xs text-ink-soft">
                Los insumos críticos generan alertas automáticas y priorizan
                líneas en órdenes de compra.
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
                  <th scope="col" className="px-5 py-3">Insumo</th>
                  <th scope="col" className="px-5 py-3">Tipo</th>
                  <th scope="col" className="px-5 py-3">Criticidad</th>
                  <th scope="col" className="px-5 py-3">Disponibilidad</th>
                  <th scope="col" className="px-5 py-3 text-right">Precio ref.</th>
                  <th scope="col" className="px-5 py-3 text-right">Precio mercado</th>
                  <th scope="col" className="px-5 py-3 text-right">Variación</th>
                  <th scope="col" className="px-5 py-3 text-right">Exposición</th>
                  <th scope="col" className="px-5 py-3 text-right">Ejec. / plan.</th>
                  <th scope="col" className="px-5 py-3 text-right">OC pendientes</th>
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
                              aria-label="En alerta"
                              className="mt-0.5 h-4 w-4 shrink-0 text-status-risk"
                            />
                          ) : null}
                          <div>
                            <p className="font-medium text-ink">{s.nombre}</p>
                            <p className="text-[11px] text-ink-soft">
                              Unidad: {s.unidad_medida}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <SupplyTypeBadge type={s.tipo} />
                      </td>
                      <td className="px-5 py-4">
                        <CriticalityBadge critical={s.es_critico} />
                      </td>
                      <td className="px-5 py-4">
                        <AvailabilityBadge value={s.disponibilidad} />
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-ink">
                        {fmtCOP(s.precio_referencia)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-ink">
                        {fmtCOP(s.precio_actual)}
                        <p className="text-[11px] font-sans text-ink-soft">
                          {s.fecha_precio_actualizacion
                            ? fmtDate(s.fecha_precio_actualizacion)
                            : "Sin carga"}
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
                          {s.proyectos_impactados} proyecto
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
                            ? `${consumo.toFixed(0)}% ejecutado`
                            : "Sin APU"}
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
            Reglas de criticidad
          </h3>
          <ul className="mt-4 grid gap-3 text-sm text-ink-muted sm:grid-cols-3">
            <li className="rounded-xl border border-line bg-canvas p-4">
              <span className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                Trigger automático
              </span>
              <p className="mt-1.5 text-ink">
                Si un insumo crítico pasa a <strong>escaso</strong>,{" "}
                <strong>agotado</strong> o <strong>descontinuado</strong>, se
                abre una alerta única por insumo.
              </p>
            </li>
            <li className="rounded-xl border border-line bg-canvas p-4">
              <span className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                Compras
              </span>
              <p className="mt-1.5 text-ink">
                Las líneas de OC con insumos críticos se marcan como{" "}
                <strong>prioritarias</strong> automáticamente al insertarse o
                actualizarse.
              </p>
            </li>
            <li className="rounded-xl border border-line bg-canvas p-4">
              <span className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                Cierre
              </span>
              <p className="mt-1.5 text-ink">
                Cuando la disponibilidad vuelve a <strong>disponible</strong>,
                la alerta se cierra y se marca <strong>resuelta</strong>.
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
      ? "Completado"
      : status === "partial"
        ? "Parcial"
        : status === "failed"
          ? "Fallido"
          : "Sin estado";

  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${tone}`}>
      Corrida {label}
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
