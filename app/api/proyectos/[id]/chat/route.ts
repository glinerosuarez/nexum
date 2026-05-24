import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ChatIntent =
  | "executive_summary"
  | "costs"
  | "supplies"
  | "progress"
  | "forecast";

type ChatSessionRow = {
  id: string;
  project_id: string;
  created_by: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

type ChatMessageRow = {
  id: string;
  session_id: string;
  project_id: string;
  role: string;
  content: string;
  metadata: unknown;
  created_at: string;
};

const OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-nano";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() || "";
const OPENAI_BASE_URL = (
  process.env.OPENAI_BASE_URL?.trim() ||
  process.env.GCP_OPENAI_PROXY_URL?.trim() ||
  "https://api.openai.com/v1"
).replace(/\/+$/, "");
const OPENAI_API_PATH = process.env.OPENAI_API_PATH?.trim() || "/responses";
const OPENAI_USE_CHAT_COMPLETIONS = process.env.OPENAI_USE_CHAT_COMPLETIONS?.trim() === "true";

function toNumber(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  const n = typeof value === "string" ? Number(value) : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatCOP(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

function compactHistory(messages: ChatMessageRow[], take = 8): string {
  const recent = messages.slice(-take);
  if (recent.length === 0) return "Sin historial previo.";
  return recent
    .map((m) => `${m.role === "user" ? "Usuario" : "Asistente"}: ${m.content}`)
    .join("\n");
}

function promptForModel(input: {
  question: string;
  intent: ChatIntent;
  deterministicAnswer: string;
  grounding: Record<string, unknown>;
  context: Awaited<ReturnType<typeof loadProjectContext>>;
  history: string;
}): string {
  return [
    "Eres Nexum Copilot, asistente de PMO para construcción.",
    "Responde en español, con tono profesional y breve.",
    "Debes usar únicamente los datos de contexto entregados.",
    "Si no hay dato suficiente, dilo explícitamente y sugiere qué dato falta.",
    "",
    `Intento detectado: ${input.intent}`,
    "",
    "Historial reciente:",
    input.history,
    "",
    "Contexto estructurado del proyecto:",
    JSON.stringify(
      {
        summary: input.context.summary,
        agent: input.context.agent,
        openIncidents: input.context.openIncidents,
        criticalSuppliesAtRisk: input.context.criticalSuppliesAtRisk,
        phases: input.context.phases,
      },
      null,
      2,
    ),
    "",
    "Respuesta determinística base (útila como guía):",
    input.deterministicAnswer,
    "",
    "Grounding base:",
    JSON.stringify(input.grounding, null, 2),
    "",
    `Pregunta del usuario: ${input.question}`,
    "",
    "Entrega:",
    "1) Respuesta principal en 4-8 líneas.",
    "2) Lista breve de 2-4 bullets con métricas clave.",
  ].join("\n");
}

async function callOpenAIAnswer(input: {
  prompt: string;
}): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;

  const endpoint = `${OPENAI_BASE_URL}${OPENAI_API_PATH.startsWith("/") ? OPENAI_API_PATH : `/${OPENAI_API_PATH}`}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(
      OPENAI_USE_CHAT_COMPLETIONS
        ? {
            model: OPENAI_MODEL,
            temperature: 0.2,
            max_tokens: 500,
            messages: [
              {
                role: "user",
                content: input.prompt,
              },
            ],
          }
        : {
            model: OPENAI_MODEL,
            input: input.prompt,
            temperature: 0.2,
            max_output_tokens: 500,
          },
    ),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`openai_http_${response.status}: ${detail.slice(0, 500)}`);
  }

  const payload = await response.json();
  if (OPENAI_USE_CHAT_COMPLETIONS) {
    const choice0 = Array.isArray(payload?.choices) ? payload.choices[0] : null;
    const content = choice0?.message?.content;

    if (typeof content === "string" && content.trim()) return content.trim();
    if (Array.isArray(content)) {
      const merged = content
        .map((item) => (typeof item?.text === "string" ? item.text.trim() : ""))
        .filter(Boolean)
        .join("\n")
        .trim();
      if (merged) return merged;
    }
    return null;
  }

  const direct = typeof payload?.output_text === "string" ? payload.output_text.trim() : "";
  if (direct) return direct;

  const chunks: string[] = [];
  const outputs = Array.isArray(payload?.output) ? payload.output : [];
  for (const out of outputs) {
    const contents = Array.isArray(out?.content) ? out.content : [];
    for (const c of contents) {
      if (typeof c?.text === "string" && c.text.trim()) chunks.push(c.text.trim());
      if (typeof c?.output_text === "string" && c.output_text.trim()) chunks.push(c.output_text.trim());
    }
  }
  const combined = chunks.join("\n").trim();
  return combined || null;
}

function detectIntent(question: string): ChatIntent {
  const q = question.toLowerCase();

  if (/(forecast|proyec|sobrecosto|overrun|riesgo)/.test(q)) return "forecast";
  if (/(insumo|material|precio|scrape|disponibilidad)/.test(q)) return "supplies";
  if (/(fase|cronograma|avance|spi|cpi|progreso)/.test(q)) return "progress";
  if (/(costo|costos|presupuesto|gasto|nomina|saldo|proveedor)/.test(q)) return "costs";
  return "executive_summary";
}

async function resolveSession(input: {
  projectId: string;
  userId: string | null;
  requestedSessionId?: string | null;
  forceNew?: boolean;
}): Promise<ChatSessionRow> {
  const supabase = await createSupabaseServerClient();

  if (!input.forceNew && input.requestedSessionId) {
    const { data: existing } = await supabase
      .from("project_chat_sessions")
      .select("id, project_id, created_by, title, created_at, updated_at, last_message_at")
      .eq("id", input.requestedSessionId)
      .eq("project_id", input.projectId)
      .maybeSingle();

    if (existing?.id) return existing as ChatSessionRow;
  }

  if (!input.forceNew) {
    let latestQuery = supabase
      .from("project_chat_sessions")
      .select("id, project_id, created_by, title, created_at, updated_at, last_message_at")
      .eq("project_id", input.projectId)
      .order("last_message_at", { ascending: false })
      .limit(1);

    if (input.userId) latestQuery = latestQuery.eq("created_by", input.userId);

    const { data: latest } = await latestQuery.maybeSingle();
    if (latest?.id) return latest as ChatSessionRow;
  }

  const title = `Chat de proyecto ${new Date().toLocaleDateString("es-CO")}`;
  const nowIso = new Date().toISOString();
  const { data: created, error } = await supabase
    .from("project_chat_sessions")
    .insert({
      project_id: input.projectId,
      created_by: input.userId,
      title,
      last_message_at: nowIso,
    })
    .select("id, project_id, created_by, title, created_at, updated_at, last_message_at")
    .single();

  if (error || !created) {
    throw new Error(`No pudimos crear sesión de chat: ${error?.message ?? "error desconocido"}`);
  }
  return created as ChatSessionRow;
}

async function findExistingSession(input: {
  projectId: string;
  userId: string | null;
  requestedSessionId?: string | null;
}): Promise<ChatSessionRow | null> {
  const supabase = await createSupabaseServerClient();

  if (input.requestedSessionId) {
    const { data: existing } = await supabase
      .from("project_chat_sessions")
      .select("id, project_id, created_by, title, created_at, updated_at, last_message_at")
      .eq("id", input.requestedSessionId)
      .eq("project_id", input.projectId)
      .maybeSingle();
    if (existing?.id) return existing as ChatSessionRow;
  }

  let latestQuery = supabase
    .from("project_chat_sessions")
    .select("id, project_id, created_by, title, created_at, updated_at, last_message_at")
    .eq("project_id", input.projectId)
    .order("last_message_at", { ascending: false })
    .limit(1);

  if (input.userId) latestQuery = latestQuery.eq("created_by", input.userId);

  const { data: latest } = await latestQuery.maybeSingle();
  return latest?.id ? (latest as ChatSessionRow) : null;
}

async function loadProjectContext(projectId: string) {
  const supabase = await createSupabaseServerClient();

  const [
    { data: summary },
    { data: agent },
    { data: phases },
    { data: incidents },
    { data: criticalSupplies },
  ] = await Promise.all([
    supabase
      .from("management_report_data")
      .select(
        "project_id, project_nombre, estado, avance_global_percent, avance_planeado_percent, presupuesto_total, gasto_ejecutado, spi_basico, cpi_basico, incidentes_abiertos",
      )
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase
      .from("agent_overrun_snapshot")
      .select(
        "last_run_id, last_run_status, supplies_targeted, supplies_scraped_ok, supplies_scraped_failed, forecast_points_written, alerts_triggered, baseline_budget, projected_total_cost, overrun_amount, overrun_pct",
      )
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase
      .from("project_phases")
      .select("id, nombre, porcentaje_completado, costo_planeado")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("incidents")
      .select("id, estado")
      .eq("project_id", projectId)
      .neq("estado", "cerrado"),
    supabase
      .from("activity_supplies")
      .select(
        "supply_id, activities!inner(project_phases!inner(project_id)), supply_catalog!inner(nombre, disponibilidad, es_critico)",
      ),
  ]);

  type CriticalSupplyRow = {
    supply_id: string;
    activities:
      | { project_phases: { project_id: string } | { project_id: string }[] | null }
      | { project_phases: { project_id: string } | { project_id: string }[] | null }[]
      | null;
    supply_catalog:
      | { nombre: string; disponibilidad: string; es_critico: boolean }
      | { nombre: string; disponibilidad: string; es_critico: boolean }[]
      | null;
  };

  const riskSupplies = new Map<string, { nombre: string; disponibilidad: string }>();
  for (const row of (criticalSupplies ?? []) as CriticalSupplyRow[]) {
    const activitiesField = Array.isArray(row.activities) ? row.activities[0] : row.activities;
    const projectPhasesField = activitiesField?.project_phases;
    const phasesArray = Array.isArray(projectPhasesField)
      ? projectPhasesField
      : projectPhasesField
        ? [projectPhasesField]
        : [];
    const belongsToProject = phasesArray.some((phase) => phase?.project_id === projectId);
    if (!belongsToProject) continue;

    const supplyField = Array.isArray(row.supply_catalog) ? row.supply_catalog[0] : row.supply_catalog;
    if (!supplyField?.es_critico) continue;
    if (supplyField.disponibilidad === "disponible") continue;
    riskSupplies.set(row.supply_id, {
      nombre: supplyField.nombre,
      disponibilidad: supplyField.disponibilidad,
    });
  }

  return {
    summary,
    agent,
    phases: phases ?? [],
    openIncidents: incidents?.length ?? 0,
    criticalSuppliesAtRisk: [...riskSupplies.values()],
  };
}

function buildAnswer(input: {
  question: string;
  intent: ChatIntent;
  context: Awaited<ReturnType<typeof loadProjectContext>>;
}): { answer: string; grounding: Record<string, unknown> } {
  const summary = input.context.summary;
  const agent = input.context.agent;
  const phases = input.context.phases;

  const projectName = summary?.project_nombre ?? "Proyecto";
  const presupuesto = toNumber(summary?.presupuesto_total);
  const gasto = toNumber(summary?.gasto_ejecutado);
  const avance = toNumber(summary?.avance_global_percent);
  const avancePlaneado = toNumber(summary?.avance_planeado_percent);
  const spi = summary?.spi_basico != null ? toNumber(summary.spi_basico) : null;
  const cpi = summary?.cpi_basico != null ? toNumber(summary.cpi_basico) : null;

  const overrunPct = agent?.overrun_pct != null ? toNumber(agent.overrun_pct) : null;
  const projectedCost = agent?.projected_total_cost != null
    ? toNumber(agent.projected_total_cost)
    : null;

  if (input.intent === "costs") {
    const saldo = presupuesto - gasto;
    const lines = [
      `Costos de ${projectName}:`,
      `- Presupuesto: ${formatCOP(presupuesto)}`,
      `- Gasto ejecutado: ${formatCOP(gasto)}`,
      `- Saldo estimado: ${formatCOP(saldo)}`,
    ];
    if (projectedCost != null && overrunPct != null) {
      lines.push(
        `- Forecast del agente: ${formatCOP(projectedCost)} (${formatPercent(overrunPct, 2)} vs base)`,
      );
    }
    return {
      answer: lines.join("\n"),
      grounding: {
        intent: input.intent,
        sources: ["management_report_data", "agent_overrun_snapshot"],
        metrics: { presupuesto, gasto, saldo, projectedCost, overrunPct },
      },
    };
  }

  if (input.intent === "supplies") {
    const riskNames = input.context.criticalSuppliesAtRisk.map((s) => s.nombre).slice(0, 5);
    const lines = [
      `Estado de insumos críticos en ${projectName}:`,
      `- Insumos objetivo del agente: ${toNumber(agent?.supplies_targeted)}`,
      `- Scrape OK / fallidos: ${toNumber(agent?.supplies_scraped_ok)} / ${toNumber(agent?.supplies_scraped_failed)}`,
      `- Alertas de disponibilidad en este proyecto: ${input.context.criticalSuppliesAtRisk.length}`,
    ];
    if (riskNames.length > 0) lines.push(`- En riesgo: ${riskNames.join(", ")}`);
    return {
      answer: lines.join("\n"),
      grounding: {
        intent: input.intent,
        sources: ["agent_overrun_snapshot", "activity_supplies", "supply_catalog"],
        metrics: {
          suppliesTargeted: toNumber(agent?.supplies_targeted),
          scrapeOk: toNumber(agent?.supplies_scraped_ok),
          scrapeFailed: toNumber(agent?.supplies_scraped_failed),
          criticalSuppliesAtRisk: input.context.criticalSuppliesAtRisk.length,
        },
      },
    };
  }

  if (input.intent === "progress") {
    const avgPhase = phases.length > 0
      ? phases.reduce((acc, p) => acc + toNumber(p.porcentaje_completado), 0) / phases.length
      : 0;
    const weakestPhases = [...phases]
      .sort((a, b) => toNumber(a.porcentaje_completado) - toNumber(b.porcentaje_completado))
      .slice(0, 3)
      .map((p) => `${p.nombre} (${formatPercent(toNumber(p.porcentaje_completado), 1)})`);

    const lines = [
      `Avance del proyecto ${projectName}:`,
      `- Avance global: ${formatPercent(avance, 1)} vs ${formatPercent(avancePlaneado, 1)} planeado`,
      `- SPI / CPI: ${spi != null ? spi.toFixed(2) : "—"} / ${cpi != null ? cpi.toFixed(2) : "—"}`,
      `- Avance promedio por fase: ${formatPercent(avgPhase, 1)}`,
      `- Fases más rezagadas: ${weakestPhases.length > 0 ? weakestPhases.join(", ") : "Sin fases registradas"}`,
    ];
    return {
      answer: lines.join("\n"),
      grounding: {
        intent: input.intent,
        sources: ["management_report_data", "project_phases"],
        metrics: { avance, avancePlaneado, spi, cpi, avgPhase, weakestPhases },
      },
    };
  }

  if (input.intent === "forecast") {
    const lines = [
      `Forecast de costos para ${projectName}:`,
      `- Puntos de forecast: ${toNumber(agent?.forecast_points_written)}`,
      `- Costo proyectado: ${projectedCost != null ? formatCOP(projectedCost) : "Sin dato"}`,
      `- Overrun estimado: ${overrunPct != null ? formatPercent(overrunPct, 2) : "Sin dato"}`,
      `- Alertas disparadas por el agente: ${toNumber(agent?.alerts_triggered)}`,
    ];
    return {
      answer: lines.join("\n"),
      grounding: {
        intent: input.intent,
        sources: ["agent_overrun_snapshot"],
        metrics: {
          forecastPoints: toNumber(agent?.forecast_points_written),
          projectedCost,
          overrunPct,
          alertsTriggered: toNumber(agent?.alerts_triggered),
        },
      },
    };
  }

  const executiveLines = [
    `Resumen ejecutivo de ${projectName}:`,
    `- Estado: ${summary?.estado ?? "Sin dato"} · Avance ${formatPercent(avance, 1)} (${formatPercent(avancePlaneado, 1)} planeado)`,
    `- Presupuesto / gasto: ${formatCOP(presupuesto)} / ${formatCOP(gasto)}`,
    `- Incidentes abiertos: ${input.context.openIncidents}`,
    `- Agente de insumos: ${toNumber(agent?.supplies_scraped_ok)} scrape OK, ${toNumber(agent?.forecast_points_written)} puntos forecast`,
  ];
  if (projectedCost != null && overrunPct != null) {
    executiveLines.push(
      `- Proyección de costo: ${formatCOP(projectedCost)} (${formatPercent(overrunPct, 2)} vs base)`,
    );
  }

  return {
    answer: executiveLines.join("\n"),
    grounding: {
      intent: input.intent,
      sources: [
        "management_report_data",
        "agent_overrun_snapshot",
        "project_phases",
        "incidents",
      ],
      metrics: {
        estado: summary?.estado ?? null,
        avance,
        avancePlaneado,
        presupuesto,
        gasto,
        openIncidents: input.context.openIncidents,
      },
    },
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();

  const url = new URL(req.url);
  const requestedSessionId = url.searchParams.get("session_id");

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();

  if (!project?.id) {
    return NextResponse.json({ ok: false, detail: "Proyecto no encontrado." }, { status: 404 });
  }

  const session = await findExistingSession({
    projectId,
    userId: userData.user?.id ?? null,
    requestedSessionId,
  });

  if (!session) {
    return NextResponse.json({
      ok: true,
      session: null,
      messages: [],
    });
  }

  const { data: messages } = await supabase
    .from("project_chat_messages")
    .select("id, session_id, project_id, role, content, metadata, created_at")
    .eq("project_id", projectId)
    .eq("session_id", session.id)
    .order("created_at", { ascending: true })
    .limit(120);

  return NextResponse.json({
    ok: true,
    session: {
      id: session.id,
      title: session.title,
      created_at: session.created_at,
      updated_at: session.updated_at,
    },
    messages: (messages ?? []) as ChatMessageRow[],
  });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();

  const body = await req.json().catch(() => ({}));
  const message = (body?.message ?? "").toString().trim();
  const requestedSessionId = (body?.session_id ?? "").toString().trim() || null;
  const forceNew = body?.new_session === true;

  if (!message) {
    return NextResponse.json({ ok: false, detail: "El mensaje no puede estar vacío." }, { status: 400 });
  }
  if (message.length > 3000) {
    return NextResponse.json({ ok: false, detail: "El mensaje es demasiado largo (máx. 3000)." }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project?.id) {
    return NextResponse.json({ ok: false, detail: "Proyecto no encontrado." }, { status: 404 });
  }

  const session = await resolveSession({
    projectId,
    userId: userData.user?.id ?? null,
    requestedSessionId,
    forceNew,
  });

  const nowIso = new Date().toISOString();

  const { data: previousMessages } = await supabase
    .from("project_chat_messages")
    .select("id, session_id, project_id, role, content, metadata, created_at")
    .eq("project_id", projectId)
    .eq("session_id", session.id)
    .order("created_at", { ascending: true })
    .limit(40);

  const { data: userMsg, error: userMsgError } = await supabase
    .from("project_chat_messages")
    .insert({
      session_id: session.id,
      project_id: projectId,
      role: "user",
      content: message,
      metadata: {},
    })
    .select("id, session_id, project_id, role, content, metadata, created_at")
    .single();
  if (userMsgError || !userMsg) {
    return NextResponse.json(
      { ok: false, detail: `No pudimos guardar el mensaje: ${userMsgError?.message ?? "error desconocido"}` },
      { status: 500 },
    );
  }

  const intent = detectIntent(message);
  const ctx = await loadProjectContext(projectId);
  const { answer, grounding } = buildAnswer({
    question: message,
    intent,
    context: ctx,
  });

  let finalAnswer = answer;
  let modelUsed = "deterministic";
  let modelError: string | null = null;

  if (OPENAI_API_KEY) {
    try {
      const llmAnswer = await callOpenAIAnswer({
        prompt: promptForModel({
          question: message,
          intent,
          deterministicAnswer: answer,
          grounding,
          context: ctx,
          history: compactHistory((previousMessages ?? []) as ChatMessageRow[]),
        }),
      });
      if (llmAnswer) {
        finalAnswer = llmAnswer;
        modelUsed = OPENAI_MODEL;
      }
    } catch (err) {
      modelError = err instanceof Error ? err.message : "model_call_failed";
    }
  }

  const { data: assistantMsg, error: assistantMsgError } = await supabase
    .from("project_chat_messages")
    .insert({
      session_id: session.id,
      project_id: projectId,
      role: "assistant",
      content: finalAnswer,
      metadata: {
        intent,
        grounding,
        model: modelUsed,
        model_error: modelError,
      },
    })
    .select("id, session_id, project_id, role, content, metadata, created_at")
    .single();
  if (assistantMsgError || !assistantMsg) {
    return NextResponse.json(
      { ok: false, detail: `No pudimos generar respuesta: ${assistantMsgError?.message ?? "error desconocido"}` },
      { status: 500 },
    );
  }

  await supabase
    .from("project_chat_sessions")
    .update({
      updated_at: nowIso,
      last_message_at: nowIso,
    })
    .eq("id", session.id);

  return NextResponse.json({
    ok: true,
    session: {
      id: session.id,
      title: session.title,
      created_at: session.created_at,
      updated_at: nowIso,
    },
    messages: [userMsg, assistantMsg] as ChatMessageRow[],
    assistant_message: assistantMsg as ChatMessageRow,
    grounding,
    model: modelUsed,
  });
}
