import Link from "next/link";
import {
  AlertOctagon,
  ArrowUpRight,
  Banknote,
  CircleAlert,
  Gauge,
  PackageSearch,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Topbar } from "@/components/dashboard/Topbar";
import { KPICard } from "@/components/dashboard/KPICard";
import {
  AvailabilityBadge,
  SupplyTypeBadge,
} from "@/components/dashboard/SupplyBadges";
import { getDashboardData } from "@/lib/dashboard-data";
import { fmtCOP, fmtCOPCompact, fmtDate, fmtNumber, fmtPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

interface DashboardPageProps {
  searchParams: Promise<{ project?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { project: projectId } = await searchParams;
  const data = await getDashboardData(projectId);
  const { project, totals, alerts, topCriticalSupplies } = data;

  const cpiTone = project?.cpi == null ? "neutral" : project.cpi >= 1 ? "ok" : project.cpi >= 0.9 ? "warn" : "risk";
  const spiTone = project?.spi == null ? "neutral" : project.spi >= 1 ? "ok" : project.spi >= 0.9 ? "warn" : "risk";
  const consumido = totals.presupuesto_total > 0
    ? (totals.gasto_ejecutado / totals.presupuesto_total) * 100
    : 0;

  return (
    <>
      <Topbar
        title={project?.nombre ?? "Sin proyecto activo"}
        subtitle={
          project
            ? `Estado: ${prettyStatus(project.estado)} · Avance ${fmtPercent(project.avance_global_percent)}${
                project.avance_planeado_percent != null
                  ? ` vs ${fmtPercent(project.avance_planeado_percent)} planeado`
                  : ""
              }`
            : "Conecta un proyecto para ver los KPIs ejecutivos."
        }
      />

      <div className="space-y-8 px-5 py-8 sm:px-8">
        <section aria-label="KPIs ejecutivos" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="Presupuesto APU"
            value={fmtCOP(totals.presupuesto_total)}
            hint="Calculado desde actividades × insumos"
            icon={Wallet}
            highlight
          />
          <KPICard
            label="Gasto ejecutado"
            value={fmtCOP(totals.gasto_ejecutado)}
            hint={`Equivale al ${fmtPercent(consumido, { decimals: 1 })} del presupuesto`}
            icon={Banknote}
            delta={{
              value: `${fmtPercent(consumido, { decimals: 1 })} consumido`,
              tone: consumido > project?.avance_global_percent! + 5 ? "warn" : "ok",
            }}
          />
          <KPICard
            label="CPI básico"
            value={project?.cpi != null ? fmtNumber(project.cpi, { decimals: 2 }) : "—"}
            hint="Valor ganado / costo real"
            icon={Gauge}
            delta={{
              value: project?.cpi != null
                ? project.cpi >= 1 ? "Sobre presupuesto" : "Bajo presupuesto"
                : "Sin datos",
              tone: cpiTone,
            }}
          />
          <KPICard
            label="SPI básico"
            value={project?.spi != null ? fmtNumber(project.spi, { decimals: 2 }) : "—"}
            hint="Avance real / avance planeado"
            icon={TrendingUp}
            delta={{
              value: project?.spi != null
                ? project.spi >= 1 ? "En tiempo" : "Atrasado"
                : "Sin datos",
              tone: spiTone,
            }}
          />
        </section>

        <section aria-label="Énfasis en insumos críticos" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="Alertas de insumos críticos"
            value={String(totals.insumos_criticos_alerta)}
            hint="Insumos críticos con disponibilidad escasa, agotada o descontinuada"
            icon={AlertOctagon}
            delta={{
              value: totals.insumos_criticos_alerta > 0 ? "Acción inmediata" : "Sin alertas",
              tone: totals.insumos_criticos_alerta > 0 ? "risk" : "ok",
            }}
          />
          <KPICard
            label="Exposición crítica"
            value={fmtCOP(totals.exposicion_critica)}
            hint="Presupuesto APU dependiente de insumos críticos en alerta"
            icon={PackageSearch}
            delta={{
              value: totals.presupuesto_total > 0
                ? `${fmtPercent((totals.exposicion_critica / totals.presupuesto_total) * 100, { decimals: 1 })} del total`
                : "—",
              tone: totals.exposicion_critica > 0 ? "warn" : "neutral",
            }}
          />
          <KPICard
            label="OC prioritarias"
            value={fmtCOP(totals.ordenes_prioritarias)}
            hint="Órdenes con al menos un insumo crítico"
            icon={Wallet}
          />
          <KPICard
            label="Incidentes abiertos"
            value={String(totals.incidentes_abiertos)}
            hint="Incluye observaciones y no conformidades"
            icon={CircleAlert}
            delta={{
              value: totals.incidentes_abiertos > 0 ? "Pendiente cierre" : "Al día",
              tone: totals.incidentes_abiertos > 0 ? "warn" : "ok",
            }}
          />
        </section>

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
                  Alertas activas de insumos críticos
                </h2>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Generadas automáticamente cuando un insumo crítico cambia su disponibilidad.
                </p>
              </div>
              <Link
                href="/dashboard/insumos"
                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                Ver catálogo
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </header>

            {alerts.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-ink-muted">
                <CircleAlert
                  aria-hidden="true"
                  className="mx-auto mb-3 h-8 w-8 text-status-ok"
                />
                Sin alertas activas. Todos los insumos críticos están disponibles.
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
                        <AvailabilityBadge value={a.disponibilidad} />
                        <SupplyTypeBadge type={a.tipo} />
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">{a.mensaje}</p>
                      <p className="mt-1 text-[11px] text-ink-soft">
                        Abierta desde {fmtDate(a.abierta_desde)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                        Exposición
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
                  Top insumos críticos por exposición
                </h2>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Mayor impacto presupuestal si fallan.
                </p>
              </div>
            </header>
            {topCriticalSupplies.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-ink-muted">
                Aún no hay insumos marcados como críticos.
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
                        <AvailabilityBadge value={s.disponibilidad} />
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
                Resumen financiero
              </h2>
              <p className="mt-0.5 text-xs text-ink-soft">
                Desagregación rápida del gasto del proyecto.
              </p>
            </div>
            <Link
              href="/dashboard/costos"
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              Ver detalle de costos
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </header>

          <dl className="grid gap-px bg-line sm:grid-cols-3">
            <FinanceCell label="Saldo a proveedores" value={fmtCOP(totals.saldo_por_pagar)} hint="Pagos pendientes" />
            <FinanceCell label="Nómina pagada" value={fmtCOP(totals.nomina_pagada)} hint="Total neto por periodo" />
            <FinanceCell
              label="Avance ponderado"
              value={fmtPercent(totals.avance, { decimals: 1 })}
              hint="Promedio ponderado por presupuesto"
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

function prettyStatus(s: string): string {
  const map: Record<string, string> = {
    planificacion: "Planificación",
    en_ejecucion: "En ejecución",
    pausado: "Pausado",
    finalizado: "Finalizado",
    cancelado: "Cancelado",
  };
  return map[s] ?? s;
}
