import { NextResponse } from "next/server";
import {
  getAgentOverrunSnapshot,
  type AgentOverrunSnapshot,
} from "@/lib/dashboard-data";
import {
  getIncomingBearerFromRequest,
  nexumApiRequest,
} from "@/lib/nexum-api/client";

interface RunSupplyCostPayload {
  project_id: string;
  mode?: "manual" | "cron";
  dry_run?: boolean;
  horizon_months?: number;
  history_months?: number;
  overrun_threshold_pct?: number;
  material_queries?: string[];
}

interface RunSupplyCostResponse {
  ok: boolean;
  phase?: string;
  run_id?: string | null;
  supplies_scraped_ok?: number;
  supplies_scraped_failed?: number;
  forecast_points_written?: number;
  alerts_triggered?: number;
  detail?: string;
}

function inferRunStatus(phase?: string): string | null {
  if (!phase) return null;
  const normalized = phase.toLowerCase();
  if (normalized.includes("partial")) return "partial";
  if (normalized.includes("fail") || normalized.includes("error")) return "failed";
  if (normalized.includes("run")) return "running";
  if (
    normalized.includes("done") ||
    normalized.includes("success") ||
    normalized.includes("completed")
  ) {
    return "completed";
  }
  return null;
}

function buildSnapshotFallback(
  projectId: string,
  payload: RunSupplyCostResponse,
): AgentOverrunSnapshot {
  const scrapedOk = payload.supplies_scraped_ok ?? 0;
  const scrapedFailed = payload.supplies_scraped_failed ?? 0;
  return {
    project_id: projectId,
    project_nombre: "",
    last_run_id: payload.run_id ?? null,
    last_run_mode: "manual",
    last_run_status: inferRunStatus(payload.phase) ?? "completed",
    last_run_started_at: null,
    last_run_finished_at: null,
    supplies_targeted: Math.max(scrapedOk + scrapedFailed, 0),
    supplies_scraped_ok: scrapedOk,
    supplies_scraped_failed: scrapedFailed,
    forecast_points_written: payload.forecast_points_written ?? 0,
    alerts_triggered: payload.alerts_triggered ?? 0,
    error_summary: payload.detail ?? null,
    last_alert_id: null,
    last_alert_severity: null,
    last_alert_status: null,
    last_alert_triggered_at: null,
    baseline_budget: 0,
    projected_total_cost: 0,
    overrun_amount: 0,
    overrun_pct: 0,
    threshold_pct: 0,
  };
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params;
  const incoming = (await req.json().catch(() => ({}))) as Partial<RunSupplyCostPayload>;
  const runId = req.headers.get("x-run-id") ?? crypto.randomUUID();

  try {
    const runPayload = await nexumApiRequest<RunSupplyCostResponse>(
      "/agent/run-supply-cost",
      {
        method: "POST",
        bearerToken: getIncomingBearerFromRequest(req),
        extraHeaders: { "x-run-id": runId },
        body: {
          project_id: projectId,
          mode: incoming.mode ?? "manual",
          dry_run: incoming.dry_run ?? false,
          horizon_months: incoming.horizon_months,
          history_months: incoming.history_months,
          overrun_threshold_pct: incoming.overrun_threshold_pct,
          material_queries: incoming.material_queries,
        },
      },
    );

    const persistedSnapshot = await getAgentOverrunSnapshot(projectId);
    const snapshot =
      persistedSnapshot ??
      (runPayload.ok ? buildSnapshotFallback(projectId, runPayload) : null);

    const response = NextResponse.json({
      ...runPayload,
      ok: runPayload.ok,
      snapshot,
    });
    response.headers.set("x-run-id", runPayload.run_id ?? runId);
    return response;
  } catch (error) {
    const snapshot = await getAgentOverrunSnapshot(projectId).catch(() => null);
    const response = NextResponse.json(
      {
        ok: false,
        reason: "agent_api_error",
        detail: error instanceof Error ? error.message : "No pudimos ejecutar el agente.",
        snapshot,
      },
      { status: 502 },
    );
    response.headers.set("x-run-id", runId);
    return response;
  }
}
