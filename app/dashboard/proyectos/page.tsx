import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  FolderKanban,
  MapPin,
  Plus,
} from "lucide-react";
import { Topbar } from "@/components/dashboard/Topbar";
import { DeleteProjectButton } from "@/components/dashboard/DeleteProjectButton";
import { listProjects } from "@/lib/dashboard-data";
import { fmtCOPCompact, fmtDate, fmtPercent } from "@/lib/format";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface ProyectosPageProps {
  searchParams: Promise<{ created?: string; deleted?: string; denied?: string }>;
}

export default async function ProyectosPage({ searchParams }: ProyectosPageProps) {
  const { created, deleted, denied } = await searchParams;
  const projects = await listProjects();
  const t = await getDictionary();

  const presupuestoTotal = projects.reduce(
    (acc, p) => acc + p.presupuesto_total,
    0,
  );
  const gastoTotal = projects.reduce((acc, p) => acc + p.gasto_ejecutado, 0);
  const enEjecucion = projects.filter((p) => p.estado === "en_ejecucion").length;

  return (
    <>
      <Topbar
        title={t.proyectos.title}
        subtitle={t.proyectos.subtitle(projects.length, enEjecucion)}
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
        {deleted ? (
          <div
            role="status"
            className="rounded-2xl border border-ink/20 bg-ink/[0.04] px-4 py-3 text-sm text-ink"
          >
            {t.proyectos.deletedOk}
          </div>
        ) : null}
        {denied ? (
          <div
            role="status"
            className="rounded-2xl border border-status-warn/30 bg-status-warn/10 px-4 py-3 text-sm text-status-warn"
          >
            {t.proyectos.accessDenied}
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-3">
          <SummaryTile label={t.proyectos.activeProjects} value={String(enEjecucion)} hint={t.proyectos.ofTotal(projects.length)} />
          <SummaryTile label={t.proyectos.totalBudget} value={fmtCOPCompact(presupuestoTotal)} hint={t.proyectos.portfolioSum} />
          <SummaryTile
            label={t.proyectos.actualSpend}
            value={fmtCOPCompact(gastoTotal)}
            hint={
              presupuestoTotal > 0
                ? `${fmtPercent((gastoTotal / presupuestoTotal) * 100, { decimals: 1 })} ${t.proyectos.ofTotalBudget}`
                : t.proyectos.noData
            }
          />
        </section>

        <section className="rounded-2xl border border-line bg-canvas-raised">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="font-display text-xl text-ink">{t.proyectos.portfolioHeader}</h2>
              <p className="mt-0.5 text-xs text-ink-soft">
                {t.proyectos.portfolioDesc}
              </p>
            </div>
            <Link
              href="/dashboard/proyectos/nuevo"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-canvas transition-colors hover:bg-[#1a1a1c]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t.proyectos.newProjectBtn}
            </Link>
          </header>

          {projects.length === 0 ? (
            <EmptyState t={t} />
          ) : (
            <ul className="divide-y divide-line">
              {projects.map((p) => {
                const consumido = p.presupuesto_total > 0
                  ? (p.gasto_ejecutado / p.presupuesto_total) * 100
                  : 0;
                return (
                  <li key={p.id} className="relative">
                    <div className="absolute right-4 top-4 z-10">
                      <DeleteProjectButton
                        projectId={p.id}
                        projectName={p.nombre}
                      />
                    </div>
                    <Link
                      href={`/dashboard/proyectos/${p.id}`}
                      className="group block px-5 py-5 transition-colors hover:bg-ink/[0.02] sm:px-6"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate font-display text-lg text-ink">
                              {p.nombre}
                            </h3>
                            <EstadoBadge estado={p.estado} />
                          </div>
                          {p.descripcion ? (
                            <p className="mt-1 line-clamp-1 text-sm text-ink-muted">
                              {p.descripcion}
                            </p>
                          ) : null}
                          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-ink-soft">
                            {p.ubicacion ? (
                              <span className="inline-flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                                {p.ubicacion}
                              </span>
                            ) : null}
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                              {fmtDate(p.fecha_inicio_planeada)} → {fmtDate(p.fecha_fin_planeada)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          <Metric
                            label="Presupuesto"
                            value={fmtCOPCompact(p.presupuesto_total)}
                          />
                          <Metric
                            label="Avance"
                            value={fmtPercent(p.avance, { decimals: 0 })}
                            tone={p.avance < 50 ? "warn" : "ok"}
                          />
                          <Metric
                            label={t.proyectos.consumed}
                            value={fmtPercent(consumido, { decimals: 0 })}
                            tone={consumido > 100 ? "risk" : consumido > 85 ? "warn" : "neutral"}
                          />
                          <ArrowRight
                            aria-hidden="true"
                            className="hidden h-5 w-5 text-ink-soft transition-transform group-hover:translate-x-1 group-hover:text-ink lg:block"
                          />
                        </div>
                      </div>

                      <div className="mt-4 h-1 overflow-hidden rounded-full bg-ink/5" aria-hidden="true">
                        <div
                          className={`h-full rounded-full ${
                            consumido > 100
                              ? "bg-status-risk"
                              : consumido > 85
                                ? "bg-status-warn"
                                : "bg-ink"
                          }`}
                          style={{ width: `${Math.min(consumido, 100)}%` }}
                        />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function EmptyState({ t }: { t: any }) {
  return (
    <div className="flex flex-col items-center px-5 py-16 text-center">
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-line bg-canvas text-ink-soft">
        <FolderKanban className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="font-display text-xl text-ink">{t.proyectos.emptyStateTitle}</p>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">
        {t.proyectos.emptyStateDesc}
      </p>
      <Link
        href="/dashboard/proyectos/nuevo"
        className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-canvas hover:bg-[#1a1a1c]"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t.proyectos.newProjectBtn}
      </Link>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-canvas-raised p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-muted">{hint}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warn" | "risk";
}) {
  const toneClass =
    tone === "risk"
      ? "text-status-risk"
      : tone === "warn"
        ? "text-status-warn"
        : tone === "ok"
          ? "text-status-ok"
          : "text-ink";
  return (
    <div className="hidden text-right md:block">
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{label}</p>
      <p className={`mt-1 font-mono text-sm ${toneClass}`}>{value}</p>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, { label: string; classes: string }> = {
    planificacion: { label: "Planificación", classes: "bg-ink/5 text-ink-muted" },
    en_ejecucion: { label: "En ejecución", classes: "bg-status-ok/10 text-status-ok" },
    pausado: { label: "Pausado", classes: "bg-status-warn/10 text-status-warn" },
    finalizado: { label: "Finalizado", classes: "bg-ink text-canvas" },
    cancelado: { label: "Cancelado", classes: "bg-status-risk/10 text-status-risk" },
  };
  const meta = map[estado] ?? { label: estado, classes: "bg-ink/5 text-ink" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${meta.classes}`}
    >
      {meta.label}
    </span>
  );
}
