import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RunMode = "manual" | "cron";

interface InvokePayload {
  project_id?: string;
  mode?: RunMode;
  dry_run?: boolean;
}

interface CriticalSupplyTarget {
  supply_id: string;
  nombre: string;
  unidad_medida: string;
  planned_quantity: number;
  budget_exposure: number;
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

  const { data: runRow, error: runInsertError } = await supabase
    .from("supply_agent_runs")
    .insert({
      project_id: projectId,
      mode,
      status: "running",
      metadata: {
        phase: "phase1_skeleton",
        dry_run: dryRun,
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
    const targets = await fetchCriticalSupplyTargets(supabase, projectId);

    const scrapeResults = await scrapeCurrentPricesStub(targets);
    const observationCount = dryRun
      ? 0
      : await persistObservationStubs(supabase, {
          runId,
          projectId,
          scrapeResults,
        });

    const forecast = await runForecastStub({ projectId, runId, targets });
    const overrunEval = await evaluateOverrunStub({ projectId, runId, targets });

    const scrapedOk = scrapeResults.filter((r) => r.status === "ok").length;
    const scrapedFailed = scrapeResults.filter((r) => r.status === "failed").length;

    const status = scrapedFailed > 0 && scrapedOk > 0
      ? "partial"
      : scrapedFailed > 0
        ? "failed"
        : "completed";

    const { error: updateError } = await supabase
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
          dry_run: dryRun,
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
        project_id: projectId,
        mode,
        dry_run: dryRun,
        phase: "phase1_skeleton",
        targeted_supplies: targets.length,
        observations_written: observationCount,
        forecast_points_written: forecast.pointsWritten,
        alerts_triggered: overrunEval.alertsTriggered,
        stage_status: {
          fetch_targets: "completed",
          scrape: "stubbed",
          time_series_write: dryRun ? "skipped_dry_run" : "stubbed",
          forecast: "stubbed",
          overrun_alert: "stubbed",
        },
      },
      200,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    await supabase
      .from("supply_agent_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_summary: message,
      })
      .eq("id", runId);

    return json({ error: "run_failed", run_id: runId, detail: message }, 500);
  }
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

async function resolveProjectId(
  supabase: ReturnType<typeof createClient>,
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

async function fetchCriticalSupplyTargets(
  supabase: ReturnType<typeof createClient>,
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
): Promise<
  Array<{ supply_id: string; status: "ok" | "failed"; unit_price: number | null; source_id: string | null; confidence: number | null; detail: string }>
> {
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
  supabase: ReturnType<typeof createClient>,
  input: {
    runId: string;
    projectId: string;
    scrapeResults: Array<{ supply_id: string; status: "ok" | "failed"; unit_price: number | null; source_id: string | null; confidence: number | null; detail: string }>;
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
