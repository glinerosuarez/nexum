import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MCP_PROTOCOL_VERSION = "2025-03-26";
const DEFAULT_HORIZON_MONTHS = 6;
const DEFAULT_HISTORY_MONTHS = 36;
const DEFAULT_OVERRUN_THRESHOLD_PCT = 10;
const DEFAULT_MCP_TIMEOUT_MS = 90_000;

type RunMode = "manual" | "cron";

type SupabaseClientLike = ReturnType<typeof createClient>;

interface InvokePayload {
  project_id?: string;
  mode?: RunMode;
  dry_run?: boolean;
  user_id?: string;
  access_token?: string;
  horizon_months?: number;
  history_months?: number;
  overrun_threshold_pct?: number;
  material_queries?: string[];
}

interface CriticalSupplyTarget {
  supply_id: string;
  nombre: string;
  unidad_medida: string;
  planned_quantity: number;
  budget_exposure: number;
}

interface ScrapeResult {
  supply_id: string;
  status: "ok" | "failed";
  unit_price: number | null;
  source_id: string | null;
  confidence: number | null;
  detail: string;
}

interface RemoteMcpConfig {
  enabled: boolean;
  required: boolean;
  url: string;
  bearerToken: string | null;
  userId: string | null;
  timeoutMs: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "missing_supabase_env" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const payload = await parsePayload(req);
  const mode: RunMode = payload.mode === "cron" ? "cron" : "manual";
  const dryRun = payload.dry_run === true;

  const projectId = await resolveProjectId(supabase, payload.project_id);
  if (!projectId) {
    return json({ error: "project_not_found" }, 404);
  }

  const remoteConfig = readRemoteMcpConfig();
  if (remoteConfig.enabled) {
    try {
      const agentUserId = await resolveAgentUserId(
        supabase,
        projectId,
        payload.user_id,
        remoteConfig.userId,
      );

      if (!agentUserId) {
        return json(
          {
            error: "missing_agent_user_id",
            detail:
              "Set SUPPLY_AGENT_USER_ID or pass user_id in request payload.",
          },
          400,
        );
      }

      const remoteResult = await runRemoteMcpForecast({
        config: remoteConfig,
        projectId,
        mode,
        dryRun,
        payload,
        userId: agentUserId,
      });

      return json(
        {
          ok: true,
          phase: "phase2_remote_mcp",
          mode,
          dry_run: dryRun,
          project_id: projectId,
          run_id: remoteResult.runId,
          targeted_supplies: remoteResult.suppliesTargeted,
          supplies_scraped_ok: remoteResult.suppliesScrapedOk,
          supplies_scraped_failed: remoteResult.suppliesScrapedFailed,
          observations_written: remoteResult.observationsWritten,
          forecast_points_written: remoteResult.forecastPointsWritten,
          alerts_triggered: remoteResult.alertsTriggered,
          last_run_status: remoteResult.lastRunStatus,
          overrun_triggered: remoteResult.overrunTriggered,
          overrun_pct: remoteResult.overrunPct,
          stage_status: {
            fetch_targets: "delegated_to_mcp",
            scrape: "delegated_to_mcp",
            time_series_write: dryRun ? "skipped_dry_run" : "delegated_to_mcp",
            forecast: "delegated_to_mcp",
            overrun_alert: "delegated_to_mcp",
          },
        },
        200,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      if (remoteConfig.required) {
        return json(
          {
            error: "remote_mcp_failed",
            project_id: projectId,
            detail: message,
          },
          502,
        );
      }

      return await runStubPipeline({
        supabase,
        projectId,
        mode,
        dryRun,
        metadataExtra: {
          remote_fallback_reason: message,
        },
      });
    }
  }

  return await runStubPipeline({
    supabase,
    projectId,
    mode,
    dryRun,
  });
});

async function parsePayload(req: Request): Promise<InvokePayload> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") return {};
    return body as InvokePayload;
  } catch {
    return {};
  }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function readRemoteMcpConfig(): RemoteMcpConfig {
  const url = (Deno.env.get("SUPPLY_AGENT_MCP_URL") ?? "").trim();
  const required = (Deno.env.get("SUPPLY_AGENT_MCP_REQUIRED") ?? "false")
    .trim()
    .toLowerCase() === "true";
  const bearerToken = normalizeBlank(Deno.env.get("SUPPLY_AGENT_MCP_BEARER"));
  const userId = normalizeBlank(Deno.env.get("SUPPLY_AGENT_USER_ID"));
  const timeoutMs = clampInt(
    Number(Deno.env.get("SUPPLY_AGENT_MCP_TIMEOUT_MS") ?? DEFAULT_MCP_TIMEOUT_MS),
    5_000,
    300_000,
    DEFAULT_MCP_TIMEOUT_MS,
  );

  return {
    enabled: url.length > 0,
    required,
    url,
    bearerToken,
    userId,
    timeoutMs,
  };
}

async function resolveProjectId(
  supabase: SupabaseClientLike,
  requestedProjectId?: string,
): Promise<string | null> {
  if (requestedProjectId) {
    const { data } = await supabase
      .from("projects")
      .select("id")
      .eq("id", requestedProjectId)
      .maybeSingle();
    return data?.id ?? null;
  }

  const { data } = await supabase
    .from("projects")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

async function resolveAgentUserId(
  supabase: SupabaseClientLike,
  projectId: string,
  payloadUserId?: string,
  envUserId?: string | null,
): Promise<string | null> {
  const candidate = normalizeBlank(payloadUserId) ?? envUserId ?? null;
  if (candidate) return candidate;

  const { data } = await supabase
    .from("project_memberships")
    .select("profile_id")
    .eq("project_id", projectId)
    .limit(1)
    .maybeSingle();

  return normalizeBlank(data?.profile_id ?? null);
}

async function runRemoteMcpForecast(input: {
  config: RemoteMcpConfig;
  projectId: string;
  mode: RunMode;
  dryRun: boolean;
  payload: InvokePayload;
  userId: string;
}): Promise<{
  runId: string | null;
  suppliesTargeted: number;
  suppliesScrapedOk: number;
  suppliesScrapedFailed: number;
  observationsWritten: number;
  forecastPointsWritten: number;
  alertsTriggered: number;
  lastRunStatus: string | null;
  overrunTriggered: boolean;
  overrunPct: number;
}> {
  const sessionId = await mcpInitialize(input.config);
  await mcpInitializedNotification(input.config, sessionId);

  const args: Record<string, unknown> = {
    user_id: input.userId,
    project_id: input.projectId,
    horizon_months: clampInt(
      Number(input.payload.horizon_months),
      1,
      24,
      DEFAULT_HORIZON_MONTHS,
    ),
    history_months: clampInt(
      Number(input.payload.history_months),
      12,
      120,
      DEFAULT_HISTORY_MONTHS,
    ),
    overrun_threshold_pct: clampNumber(
      Number(input.payload.overrun_threshold_pct),
      0,
      100,
      DEFAULT_OVERRUN_THRESHOLD_PCT,
    ),
    persist: !input.dryRun,
    trigger: input.mode,
    dry_run: input.dryRun,
  };

  const materialQueries = normalizeMaterialQueries(input.payload.material_queries);
  if (materialQueries.length > 0) {
    args.material_queries = materialQueries;
  }

  const accessToken = normalizeBlank(input.payload.access_token);
  if (accessToken) {
    args.access_token = accessToken;
  }

  const response = await mcpCallTool(
    input.config,
    sessionId,
    "material_price_forecast",
    args,
  );

  const result = extractToolPayload(response);
  if (!result || typeof result !== "object") {
    throw new Error("remote_mcp_invalid_payload");
  }

  const maybeError = (result as Record<string, unknown>).error;
  if (typeof maybeError === "string" && maybeError.length > 0) {
    throw new Error(`remote_mcp_tool_error: ${maybeError}`);
  }

  const success = (result as Record<string, unknown>).success;
  if (success === false) {
    throw new Error("remote_mcp_tool_unsuccessful");
  }

  const run = toObject((result as Record<string, unknown>).run);
  const counters = toObject(run?.counters);
  const budgetImpact = toObject((result as Record<string, unknown>).budget_impact);

  const suppliesTargeted = toNumber(
    counters?.supplies_requested,
    Array.isArray((result as Record<string, unknown>).supplies)
      ? ((result as Record<string, unknown>).supplies as unknown[]).length
      : 0,
  );

  const processed = toNumber(counters?.supplies_processed, suppliesTargeted);
  const errors = toNumber(counters?.errors, 0);
  const alertsTriggered = toNumber(
    counters?.alerts_created,
    Array.isArray((result as Record<string, unknown>).alerts)
      ? ((result as Record<string, unknown>).alerts as unknown[]).length
      : 0,
  );

  return {
    runId: typeof run?.id === "string" ? run.id : null,
    suppliesTargeted,
    suppliesScrapedOk: processed,
    suppliesScrapedFailed: errors,
    observationsWritten: toNumber(counters?.observations_written, 0),
    forecastPointsWritten: toNumber(counters?.forecasts_written, 0),
    alertsTriggered,
    lastRunStatus: typeof run?.status === "string" ? run.status : null,
    overrunTriggered: budgetImpact?.overrun_triggered === true,
    overrunPct: toNumber(budgetImpact?.estimated_indexed_delta_pct, 0),
  };
}

async function mcpInitialize(config: RemoteMcpConfig): Promise<string> {
  const response = await mcpRequest(config, {
    jsonrpc: "2.0",
    id: `init-${Date.now()}`,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "nexum-run-supply-cost-agent",
        version: "0.2.0",
      },
    },
  });

  const payload = parseMcpEnvelope(await response.text());
  if (payload.error) {
    throw new Error(`mcp_initialize_failed: ${String(payload.error.message ?? "unknown")}`);
  }

  const sessionId =
    response.headers.get("mcp-session-id") ??
    response.headers.get("Mcp-Session-Id") ??
    "";

  if (!sessionId) {
    throw new Error("mcp_initialize_missing_session_id");
  }

  return sessionId;
}

async function mcpInitializedNotification(
  config: RemoteMcpConfig,
  sessionId: string,
): Promise<void> {
  await mcpRequest(
    config,
    {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    },
    sessionId,
  );
}

async function mcpCallTool(
  config: RemoteMcpConfig,
  sessionId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const response = await mcpRequest(
    config,
    {
      jsonrpc: "2.0",
      id: `tool-${Date.now()}`,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    },
    sessionId,
  );

  return parseMcpEnvelope(await response.text());
}

async function mcpRequest(
  config: RemoteMcpConfig,
  body: Record<string, unknown>,
  sessionId?: string,
): Promise<Response> {
  const headers = new Headers({
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  });

  if (sessionId) {
    headers.set("mcp-session-id", sessionId);
    headers.set("MCP-Protocol-Version", MCP_PROTOCOL_VERSION);
  }

  if (config.bearerToken) {
    headers.set("Authorization", `Bearer ${config.bearerToken}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`mcp_http_${response.status}: ${text.slice(0, 600)}`);
    }

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseMcpEnvelope(rawBody: string): {
  result?: unknown;
  error?: { message?: string };
} {
  const direct = parseJsonObject(rawBody);
  if (direct) return direct as { result?: unknown; error?: { message?: string } };

  const lines = rawBody
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line.length > 0 && line !== "[DONE]");

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const parsed = parseJsonObject(lines[i]);
    if (parsed) return parsed as { result?: unknown; error?: { message?: string } };
  }

  throw new Error("mcp_response_parse_failed");
}

function extractToolPayload(envelope: unknown): unknown {
  const env = toObject(envelope);
  if (!env) return null;

  if (env.error) {
    return { error: toObject(env.error)?.message ?? "mcp_unknown_error" };
  }

  const result = toObject(env.result);
  if (!result) return null;

  const structured = toObject(result.structuredContent);
  if (structured) return structured;

  const content = Array.isArray(result.content) ? result.content : [];
  for (const item of content) {
    const text = toObject(item)?.text;
    if (typeof text !== "string") continue;
    const parsed = parseJsonObject(text);
    if (parsed) return parsed;
  }

  return null;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function runStubPipeline(input: {
  supabase: SupabaseClientLike;
  projectId: string;
  mode: RunMode;
  dryRun: boolean;
  metadataExtra?: Record<string, unknown>;
}): Promise<Response> {
  const { data: runRow, error: runInsertError } = await input.supabase
    .from("supply_agent_runs")
    .insert({
      project_id: input.projectId,
      mode: input.mode,
      status: "running",
      metadata: {
        phase: "phase1_skeleton",
        dry_run: input.dryRun,
        ...(input.metadataExtra ?? {}),
      },
    })
    .select("id")
    .single();

  if (runInsertError || !runRow) {
    return json(
      { error: "run_insert_failed", detail: runInsertError?.message ?? null },
      500,
    );
  }

  const runId = runRow.id as string;

  try {
    const targets = await fetchCriticalSupplyTargets(input.supabase, input.projectId);

    const scrapeResults = await scrapeCurrentPricesStub(targets);
    const observationCount = input.dryRun
      ? 0
      : await persistObservationStubs(input.supabase, {
        runId,
        projectId: input.projectId,
        scrapeResults,
      });

    const forecast = await runForecastStub({
      projectId: input.projectId,
      runId,
      targets,
    });
    const overrunEval = await evaluateOverrunStub({
      projectId: input.projectId,
      runId,
      targets,
    });

    const scrapedOk = scrapeResults.filter((r) => r.status === "ok").length;
    const scrapedFailed = scrapeResults.filter((r) => r.status === "failed").length;

    const status = scrapedFailed > 0 && scrapedOk > 0
      ? "partial"
      : scrapedFailed > 0
        ? "failed"
        : "completed";

    const { error: updateError } = await input.supabase
      .from("supply_agent_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        supplies_targeted: targets.length,
        supplies_scraped_ok: scrapedOk,
        supplies_scraped_failed: scrapedFailed,
        forecast_points_written: forecast.pointsWritten,
        alerts_triggered: overrunEval.alertsTriggered,
        error_summary: scrapedFailed > 0 ? "scrape_stub_failed_items" : null,
        metadata: {
          phase: "phase1_skeleton",
          dry_run: input.dryRun,
          ...(input.metadataExtra ?? {}),
          todo: [
            "replace_scrape_stub_with_real_web_scraper",
            "replace_forecast_stub_with_time_series_model",
            "replace_overrun_stub_with_budget_threshold_evaluation",
          ],
        },
      })
      .eq("id", runId);

    if (updateError) {
      return json(
        {
          error: "run_update_failed",
          run_id: runId,
          detail: updateError.message,
        },
        500,
      );
    }

    return json(
      {
        ok: true,
        run_id: runId,
        project_id: input.projectId,
        mode: input.mode,
        dry_run: input.dryRun,
        phase: "phase1_skeleton",
        targeted_supplies: targets.length,
        observations_written: observationCount,
        forecast_points_written: forecast.pointsWritten,
        alerts_triggered: overrunEval.alertsTriggered,
        stage_status: {
          fetch_targets: "completed",
          scrape: "stubbed",
          time_series_write: input.dryRun ? "skipped_dry_run" : "stubbed",
          forecast: "stubbed",
          overrun_alert: "stubbed",
        },
      },
      200,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    await input.supabase
      .from("supply_agent_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_summary: message,
      })
      .eq("id", runId);

    return json({ error: "run_failed", run_id: runId, detail: message }, 500);
  }
}

async function fetchCriticalSupplyTargets(
  supabase: SupabaseClientLike,
  projectId: string,
): Promise<CriticalSupplyTarget[]> {
  const { data: phases } = await supabase
    .from("project_phases")
    .select("id")
    .eq("project_id", projectId);

  const phaseIds = (phases ?? []).map((p) => p.id);
  if (phaseIds.length === 0) return [];

  const { data: activities } = await supabase
    .from("activities")
    .select("id")
    .in("phase_id", phaseIds);

  const activityIds = (activities ?? []).map((a) => a.id);
  if (activityIds.length === 0) return [];

  const { data: apuLines } = await supabase
    .from("activity_supplies")
    .select("supply_id, cantidad_planeada, precio_unitario, subtotal")
    .in("activity_id", activityIds);

  const exposureBySupply = new Map<string, { qty: number; exposure: number }>();
  for (const row of apuLines ?? []) {
    const qty = Number(row.cantidad_planeada ?? 0);
    const unit = Number(row.precio_unitario ?? 0);
    const subtotal = Number(row.subtotal ?? qty * unit);

    const prev = exposureBySupply.get(row.supply_id) ?? { qty: 0, exposure: 0 };
    prev.qty += Number.isFinite(qty) ? qty : 0;
    prev.exposure += Number.isFinite(subtotal) ? subtotal : 0;
    exposureBySupply.set(row.supply_id, prev);
  }

  const supplyIds = [...exposureBySupply.keys()];
  if (supplyIds.length === 0) return [];

  const { data: critical } = await supabase
    .from("supply_catalog")
    .select("id, nombre, unidad_medida")
    .in("id", supplyIds)
    .eq("es_critico", true)
    .eq("activo", true);

  return (critical ?? [])
    .map((s) => {
      const agg = exposureBySupply.get(s.id) ?? { qty: 0, exposure: 0 };
      return {
        supply_id: s.id,
        nombre: s.nombre,
        unidad_medida: s.unidad_medida,
        planned_quantity: agg.qty,
        budget_exposure: agg.exposure,
      };
    })
    .sort((a, b) => b.budget_exposure - a.budget_exposure);
}

async function scrapeCurrentPricesStub(
  targets: CriticalSupplyTarget[],
): Promise<ScrapeResult[]> {
  return targets.map((t) => ({
    supply_id: t.supply_id,
    status: "failed",
    unit_price: null,
    source_id: null,
    confidence: null,
    detail: "phase1_stub_no_scraper_implemented",
  }));
}

async function persistObservationStubs(
  supabase: SupabaseClientLike,
  input: {
    runId: string;
    projectId: string;
    scrapeResults: ScrapeResult[];
  },
): Promise<number> {
  const toInsert = input.scrapeResults
    .filter((r) => r.status === "ok" && r.unit_price != null)
    .map((r) => ({
      project_id: input.projectId,
      supply_id: r.supply_id,
      source_id: r.source_id,
      agent_run_id: input.runId,
      observed_at: new Date().toISOString().slice(0, 10),
      unit_price: r.unit_price,
      currency: "COP",
      confidence: r.confidence,
      raw_payload: {
        stage: "phase1_stub",
        detail: r.detail,
      },
    }));

  if (toInsert.length === 0) return 0;

  const { error } = await supabase
    .from("supply_price_observations")
    .insert(toInsert);

  if (error) {
    throw new Error(`observation_insert_failed: ${error.message}`);
  }

  return toInsert.length;
}

async function runForecastStub(_input: {
  projectId: string;
  runId: string;
  targets: CriticalSupplyTarget[];
}): Promise<{ pointsWritten: number }> {
  return { pointsWritten: 0 };
}

async function evaluateOverrunStub(_input: {
  projectId: string;
  runId: string;
  targets: CriticalSupplyTarget[];
}): Promise<{ alertsTriggered: number }> {
  return { alertsTriggered: 0 };
}

function toObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeBlank(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeMaterialQueries(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0)
    .slice(0, 30);
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  return Math.min(Math.max(rounded, min), max);
}

function clampNumber(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}
