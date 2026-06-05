"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bot, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { fmtCOP, fmtDate, fmtNumber, fmtPercent } from "@/lib/format";

interface AgentSnapshot {
  last_run_status: string | null;
  last_run_started_at: string | null;
  last_run_finished_at: string | null;
  supplies_targeted: number | string | null;
  supplies_scraped_ok: number | string | null;
  supplies_scraped_failed: number | string | null;
  forecast_points_written: number | string | null;
  alerts_triggered: number | string | null;
  error_summary: string | null;
  baseline_budget: number | string | null;
  projected_total_cost: number | string | null;
  overrun_amount: number | string | null;
  overrun_pct: number | string | null;
}

type RunState =
  | { phase: "running"; snapshot: null; detail: null }
  | { phase: "done"; snapshot: AgentSnapshot | null; detail: null }
  | { phase: "error"; snapshot: AgentSnapshot | null; detail: string };

function toNumericOrNull(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
}

function getDesviacion(snapshot: AgentSnapshot | null) {
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

export function AgentRunFlow({
  projectId,
  shouldAutoRun = true,
  normalizedSupplyCount = 0,
}: {
  projectId: string;
  shouldAutoRun?: boolean;
  normalizedSupplyCount?: number;
}) {
  const [state, setState] = useState<RunState>({
    phase: shouldAutoRun ? "running" : "done",
    snapshot: null,
    detail: null,
  });

  useEffect(() => {
    if (!shouldAutoRun) {
      setState({
        phase: "done",
        snapshot: null,
        detail: null,
      });
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/proyectos/${projectId}/run-supply-agent`, {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
        });

        const payload = (await res.json()) as {
          ok: boolean;
          snapshot?: AgentSnapshot | null;
          detail?: string;
        };

        if (!payload.ok) {
          setState({
            phase: "error",
            snapshot: payload.snapshot ?? null,
            detail: payload.detail ?? "No pudimos ejecutar el agente.",
          });
          return;
        }

        setState({
          phase: "done",
          snapshot: payload.snapshot ?? null,
          detail: null,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          phase: "error",
          snapshot: null,
          detail:
            error instanceof Error
              ? error.message
              : "No pudimos ejecutar el agente.",
        });
      }
    })();

    return () => controller.abort();
  }, [projectId, shouldAutoRun]);

  const snapshot = state.snapshot;
  const desviacion = getDesviacion(snapshot);
  const runLabel = !snapshot?.last_run_status
    ? "Sin corrida"
    : snapshot.last_run_status === "completed"
      ? "Corrida completada"
      : snapshot.last_run_status === "partial"
        ? "Corrida parcial"
        : snapshot.last_run_status === "failed"
          ? "Corrida fallida"
          : "Corrida finalizada";

  if (state.phase === "running") {
    return (
      <section className="rounded-2xl border border-line bg-canvas-raised px-6 py-14 text-center">
        <div className="mx-auto flex max-w-xl flex-col items-center">
          <span className="relative mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full border border-ink/10 bg-ink/5">
            <span className="absolute inset-0 animate-ping rounded-full border border-ink/20" />
            <Bot className="h-7 w-7 text-ink" aria-hidden="true" />
          </span>
          <h2 className="font-display text-3xl text-ink">Llamando al agente de insumos críticos</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Estamos monitoreando precios, corriendo forecast y evaluando riesgo de sobrecostos.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-4 py-2 text-sm text-ink-soft">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Procesando información del proyecto...
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5 rounded-2xl border border-line bg-canvas-raised p-6">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full bg-status-ok/10 px-3 py-1 text-sm text-status-ok">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {runLabel}
        </p>
        <p className="mt-2 text-xs text-ink-soft">
          Inicio {fmtDate(snapshot?.last_run_started_at ?? null)} · Fin{" "}
          {fmtDate(snapshot?.last_run_finished_at ?? null)}
        </p>
      </div>

      {!shouldAutoRun ? (
        <div className="rounded-xl border border-status-warn/30 bg-status-warn/10 px-3 py-2 text-sm text-status-warn">
          No ejecutamos el agente automáticamente porque este proyecto no tiene insumos normalizados persistidos.
          Detectados: {normalizedSupplyCount}.
        </div>
      ) : null}

      {state.phase === "error" ? (
        <div className="rounded-xl border border-status-warn/30 bg-status-warn/10 px-3 py-2 text-xs text-status-warn">
          No pudimos completar la corrida automáticamente: {state.detail}
        </div>
      ) : null}

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCell label="Insumos objetivo" value={fmtNumber(snapshot?.supplies_targeted, { decimals: 0 })} />
        <MetricCell label="Scrape OK" value={fmtNumber(snapshot?.supplies_scraped_ok, { decimals: 0 })} />
        <MetricCell label="Scrape fallidos" value={fmtNumber(snapshot?.supplies_scraped_failed, { decimals: 0 })} />
        <MetricCell label="Puntos forecast" value={fmtNumber(snapshot?.forecast_points_written, { decimals: 0 })} />
        <MetricCell label="Alertas disparadas" value={fmtNumber(snapshot?.alerts_triggered, { decimals: 0 })} />
      </dl>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCell label="Budget base" value={fmtCOP(snapshot?.baseline_budget)} />
        <MetricCell label="Costo proyectado" value={fmtCOP(snapshot?.projected_total_cost)} />
        <MetricCell
          label="Desviación"
          value={`${fmtSignedCOP(desviacion.amount)} · ${fmtSignedPercent(desviacion.pct)}`}
        />
      </div>

      {snapshot?.error_summary ? (
        <p className="inline-flex items-center gap-2 rounded-xl border border-status-warn/30 bg-status-warn/10 px-3 py-2 text-xs text-status-warn">
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
          Último error: {snapshot.error_summary}
        </p>
      ) : null}

      <div className="flex justify-end border-t border-line pt-4">
        <Link
          href={`/dashboard/proyectos/${projectId}?created=1`}
          className="inline-flex h-11 items-center justify-center rounded-full bg-ink px-6 text-sm font-medium text-canvas transition-colors hover:bg-[#1a1a1c]"
        >
          Aceptar
        </Link>
      </div>
    </section>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-canvas px-4 py-3">
      <dt className="text-[11px] uppercase tracking-[0.2em] text-ink-soft">{label}</dt>
      <dd className="mt-2 font-mono text-2xl text-ink">{value}</dd>
    </div>
  );
}
