import Link from "next/link";
import {
  AlertOctagon,
  ArrowUpRight,
  Banknote,
  CircleAlert,
  Gauge,
  PackageSearch,
  Siren,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { Topbar } from "@/components/dashboard/Topbar";
import { DeleteProjectButton } from "@/components/dashboard/DeleteProjectButton";
import { KPICard } from "@/components/dashboard/KPICard";
import { ProjectionCurve } from "@/components/dashboard/ProjectionCurve";
import {
  AvailabilityBadge,
  SupplyTypeBadge,
} from "@/components/dashboard/SupplyBadges";
import { getDashboardData } from "@/lib/dashboard-data";
import { fmtCOP, fmtCOPCompact, fmtDate, fmtNumber, fmtPercent } from "@/lib/format";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface ProjectDashboardProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}

export default async function ProjectDashboard({
  params,
  searchParams,
}: ProjectDashboardProps) {
  const { id: projectId } = await params;
  const { created } = await searchParams;
  const data = await getDashboardData(projectId);
  const t = await getDictionary(projectId);
  const { project, totals, alerts, topCriticalSupplies, curva, priceRisk } = data;

  const cpiTone = project?.cpi == null ? "neutral" : project.cpi >= 1 ? "ok" : project.cpi >= 0.9 ? "warn" : "risk";
  const spiTone = project?.spi == null ? "neutral" : project.spi >= 1 ? "ok" : project.spi >= 0.9 ? "warn" : "risk";
  const consumido = totals.presupuesto_total > 0
    ? (totals.gasto_ejecutado / totals.presupuesto_total) * 100
    : 0;
  const overrunTone =
    priceRisk.severity === "critical"
      ? "risk"
      : priceRisk.severity === "warn"
        ? "warn"
        : "ok";

  return (
    <>
      <Topbar
        title={project?.nombre ?? t.sidebar.noProjectActive}
        subtitle={
          project
            ? `${t.execDashboard.statusPrefix} ${prettyStatus(project.estado, t)} · ${t.execDashboard.progressPrefix} ${fmtPercent(project.avance_global_percent)}${
                project.avance_planeado_percent != null
                  ? ` ${t.execDashboard.vsPlanned} ${fmtPercent(project.avance_planeado_percent)} ${t.execDashboard.planned}`
                  : ""
              }`
            : t.execDashboard.noProjectHint
        }
      />

      <div className="space-y-8 px-5 py-8 sm:px-8">
        {created ? (
          <div
            role="status"
            className="rounded-2xl border border-status-ok/30 bg-status-ok/5 px-4 py-3 text-sm text-status-ok"
          >
            {t.proyectos.createdOk}
          </div>
        ) : null}

        {project ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <DeleteProjectButton
              projectId={project.id}
              projectName={project.nombre}
              variant="danger"
            />
          </div>
        ) : null}
        <section aria-label="KPIs ejecutivos" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label={t.execDashboard.budgetApu}
            value={fmtCOP(totals.presupuesto_total)}
            hint={t.execDashboard.budgetApuHint}
            icon={Wallet}
            highlight
          />
          <KPICard
            label={t.execDashboard.executedSpend}
            value={fmtCOP(totals.gasto_ejecutado)}
            hint={t.execDashboard.executedSpendHint(fmtPercent(consumido, { decimals: 1 }))}
            icon={Banknote}
            delta={{
              value: `${fmtPercent(consumido, { decimals: 1 })} ${t.execDashboard.consumed}`,
              tone: consumido > project?.avance_global_percent! + 5 ? "warn" : "ok",
            }}
          />
          <KPICard
            label={t.execDashboard.basicCpi}
            value={project?.cpi != null ? fmtNumber(project.cpi, { decimals: 2 }) : "—"}
            hint={t.execDashboard.basicCpiHint}
            icon={Gauge}
            delta={{
              value: project?.cpi != null
                ? project.cpi >= 1 ? t.execDashboard.underBudget : t.execDashboard.overBudget
                : t.execDashboard.noData,
              tone: cpiTone,
            }}
          />
          <KPICard
            label={t.execDashboard.basicSpi}
            value={project?.spi != null ? fmtNumber(project.spi, { decimals: 2 }) : "—"}
            hint={t.execDashboard.basicSpiHint}
            icon={TrendingUp}
            delta={{
              value: project?.spi != null
                ? project.spi >= 1 ? t.execDashboard.onTime : t.execDashboard.delayed
                : t.execDashboard.noData,
              tone: spiTone,
            }}
          />
        </section>

        <section aria-label="Énfasis en insumos críticos" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label={t.execDashboard.criticalAlerts}
            value={String(totals.insumos_criticos_alerta)}
            hint={t.execDashboard.criticalAlertsHint}
            icon={AlertOctagon}
            delta={{
              value: totals.insumos_criticos_alerta > 0 ? t.execDashboard.immediateAction : t.execDashboard.noAlerts,
              tone: totals.insumos_criticos_alerta > 0 ? "risk" : "ok",
            }}
          />
          <KPICard
            label={t.execDashboard.criticalExposure}
            value={fmtCOP(totals.exposicion_critica)}
            hint={t.execDashboard.criticalExposureHint}
            icon={PackageSearch}
            delta={{
              value: totals.presupuesto_total > 0
                ? `${fmtPercent((totals.exposicion_critica / totals.presupuesto_total) * 100, { decimals: 1 })} ${t.execDashboard.ofTotal}`
                : "—",
              tone: totals.exposicion_critica > 0 ? "warn" : "neutral",
            }}
          />
          <KPICard
            label={t.execDashboard.priorityOc}
            value={fmtCOP(totals.ordenes_prioritarias)}
            hint={t.execDashboard.priorityOcHint}
            icon={Wallet}
          />
          <KPICard
            label={t.execDashboard.openIncidents}
            value={String(totals.incidentes_abiertos)}
            hint={t.execDashboard.openIncidentsHint}
            icon={CircleAlert}
            delta={{
              value: totals.incidentes_abiertos > 0 ? t.execDashboard.immediateAction : t.execDashboard.upToDate,
              tone: totals.incidentes_abiertos > 0 ? "warn" : "ok",
            }}
          />
        </section>

        <section aria-label="Riesgo por variación de precios" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl text-ink">
                {t.execDashboard.priceRiskTitle}
              </h2>
              <p className="text-sm text-ink-soft">
                {t.execDashboard.priceRiskSubtitle}
              </p>
            </div>
          </div>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard
              label={t.execDashboard.projectedOverrun}
              value={fmtCOP(priceRisk.projectedAdditionalCost)}
              hint={t.execDashboard.additionalImpact}
              icon={TriangleAlert}
              delta={{
                value: `${fmtPercent(priceRisk.projectedOverrunPercent, { decimals: 1 })} ${t.execDashboard.ofBudget}`,
                tone: overrunTone,
              }}
            />
            <KPICard
              label={t.execDashboard.projectedBudget}
              value={fmtCOP(priceRisk.projectedBudget)}
              hint={t.execDashboard.budgetPlusOverrun}
              icon={Wallet}
            />
            <KPICard
              label={t.execDashboard.suppliesAtRisk}
              value={String(priceRisk.suppliesAtRisk)}
              hint={`${priceRisk.criticalSupplies} ${t.execDashboard.criticalHike}`}
              icon={Siren}
              delta={{
                value: `${String(priceRisk.changedSupplies)} ${t.execDashboard.withPriceChange}`,
                tone: overrunTone,
              }}
            />
            <KPICard
              label={t.execDashboard.lastLoad}
              value={priceRisk.lastUpdateDate ? fmtDate(priceRisk.lastUpdateDate, t.locale) : "—"}
              hint={priceRisk.hasPriceUpdates
                ? `${t.execDashboard.affectedBudget} ${fmtCOPCompact(priceRisk.affectedBudget)}`
                : t.execDashboard.noBatchesLoaded}
              icon={TrendingUp}
            />
          </section>

          <article className="overflow-hidden rounded-2xl border border-line bg-canvas-raised">
            <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h3 className="font-display text-xl text-ink">{t.execDashboard.highestImpactSupplies}</h3>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {t.execDashboard.projectionHint}
                </p>
              </div>
            </header>
            {priceRisk.topImpacts.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-ink-muted">
                {t.execDashboard.noHikesDetected}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-[11px] font-medium uppercase tracking-[0.12em] text-ink-soft">
                      <th scope="col" className="px-5 py-3">{t.execDashboard.supply}</th>
                      <th scope="col" className="px-5 py-3 text-right">{t.execDashboard.basePrice}</th>
                      <th scope="col" className="px-5 py-3 text-right">{t.execDashboard.currentPrice}</th>
                      <th scope="col" className="px-5 py-3 text-right">{t.execDashboard.variation}</th>
                      <th scope="col" className="px-5 py-3 text-right">{t.execDashboard.impact}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceRisk.topImpacts.map((row) => (
                      <tr
                        key={row.supply_id}
                        className="border-b border-line/70 transition-colors hover:bg-ink/[0.02]"
                      >
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-ink">{row.nombre}</p>
                          <p className="text-[11px] text-ink-soft">
                            {row.tipo} · {fmtNumber(row.cantidad_planeada_total)} {row.unidad_medida}
                          </p>
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-ink">
                          {fmtCOP(row.baseline_unit_price)}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-ink">
                          {fmtCOP(row.current_unit_price)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span
                            className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                              row.severity === "critical"
                                ? "bg-status-risk/10 text-status-risk"
                                : row.severity === "warn"
                                  ? "bg-status-warn/10 text-status-warn"
                                  : "bg-status-ok/10 text-status-ok"
                            }`}
                          >
                            {fmtPercent(row.unit_price_change_pct, { decimals: 1 })}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-status-risk">
                          {fmtCOP(row.impact_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
          </section>

          <ProjectionCurve data={curva} />

          <div className="grid gap-6 lg:grid-cols-12">
          <section
            aria-labelledby="alertas-criticas"
            className="rounded-2xl border border-line bg-canvas-raised lg:col-span-7"
          >
            <header className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2
                  id="alertas-criticas"
                  className="font-display text-xl text-ink"
                >
                  {t.execDashboard.activeAlertsTitle}
                </h2>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {t.execDashboard.activeAlertsSubtitle}
                </p>
              </div>
              <Link
                href={`/dashboard/proyectos/${projectId}/insumos`}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                {t.execDashboard.viewCatalog}
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </header>

            {alerts.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-ink-muted">
                <CircleAlert
                  aria-hidden="true"
                  className="mx-auto mb-3 h-8 w-8 text-status-ok"
                />
                {t.execDashboard.noActiveAlerts}
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {alerts.map((a) => (
                  <li key={a.alert_id} className="flex items-start gap-4 px-5 py-4">
                    <span
                      aria-hidden="true"
                      className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-status-risk/10 text-status-risk"
                    >
                      <AlertOctagon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-ink">{a.nombre}</p>
                        <AvailabilityBadge value={a.disponibilidad} locale={t.locale} />
                        <SupplyTypeBadge type={a.tipo} locale={t.locale} />
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">{a.mensaje}</p>
                      <p className="mt-1 text-[11px] text-ink-soft">
                        {t.execDashboard.openedSince} {fmtDate(a.abierta_desde, t.locale)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                        {t.execDashboard.exposure}
                      </p>
                      <p className="mt-1 font-mono text-sm text-ink">
                        {fmtCOPCompact(a.exposicion)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            aria-labelledby="top-criticos"
            className="rounded-2xl border border-line bg-canvas-raised lg:col-span-5"
          >
            <header className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2
                  id="top-criticos"
                  className="font-display text-xl text-ink"
                >
                  {t.execDashboard.topCriticalTitle}
                </h2>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {t.execDashboard.topCriticalSubtitle}
                </p>
              </div>
            </header>
            {topCriticalSupplies.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-ink-muted">
                {t.execDashboard.noCriticalSupplies}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {topCriticalSupplies.map((s, idx) => {
                  const pct = totals.presupuesto_total > 0
                    ? (s.exposicion_presupuestal / totals.presupuesto_total) * 100
                    : 0;
                  return (
                    <li key={s.id} className="px-5 py-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="font-mono text-[11px] text-ink-soft">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <p className="truncate text-sm text-ink">{s.nombre}</p>
                        </div>
                        <p className="font-mono text-sm text-ink">
                          {fmtCOPCompact(s.exposicion_presupuestal)}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div
                          className="h-1 flex-1 overflow-hidden rounded-full bg-ink/5"
                          aria-hidden="true"
                        >
                          <div
                            className={`h-full rounded-full ${
                              s.disponibilidad === "disponible"
                                ? "bg-ink"
                                : "bg-accent"
                            }`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <AvailabilityBadge value={s.disponibilidad} locale={t.locale} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <section
          aria-labelledby="resumen-financiero"
          className="rounded-2xl border border-line bg-canvas-raised"
        >
          <header className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2
                id="resumen-financiero"
                className="font-display text-xl text-ink"
              >
                {t.execDashboard.financialSummaryTitle}
              </h2>
              <p className="mt-0.5 text-xs text-ink-soft">
                {t.execDashboard.financialSummarySubtitle}
              </p>
            </div>
            <Link
              href={`/dashboard/proyectos/${projectId}/costos`}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              {t.execDashboard.viewCostDetail}
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </header>

          <dl className="grid gap-px bg-line sm:grid-cols-3">
            <FinanceCell label={t.execDashboard.balanceToSuppliers} value={fmtCOP(totals.saldo_por_pagar)} hint={t.execDashboard.pendingPayments} />
            <FinanceCell label={t.execDashboard.paidPayroll} value={fmtCOP(totals.nomina_pagada)} hint={t.execDashboard.netTotalPerPeriod} />
            <FinanceCell
              label={t.execDashboard.weightedProgress}
              value={fmtPercent(totals.avance, { decimals: 1 })}
              hint={t.execDashboard.weightedByBudget}
            />
          </dl>
        </section>
      </div>
    </>
  );
}

function FinanceCell({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-canvas-raised px-5 py-5">
      <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
        {label}
      </dt>
      <dd className="mt-2 font-display text-2xl text-ink">{value}</dd>
      <p className="mt-1 text-xs text-ink-muted">{hint}</p>
    </div>
  );
}

function prettyStatus(s: string, t: any): string {
  const map: Record<string, string> = {
    planificacion: t.wizard.statusPlanning,
    en_ejecucion: t.wizard.statusExecution,
    pausado: t.wizard.statusPaused,
    finalizado: t.wizard.statusFinished,
    cancelado: t.wizard.statusCancelled,
  };
  return map[s] ?? s;
}
