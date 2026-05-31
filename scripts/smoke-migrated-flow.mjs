#!/usr/bin/env node

const nextBaseUrl = (process.env.NEXT_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const apiBaseUrl = (process.env.NEXUM_API_BASE_URL || "").replace(/\/+$/, "");
const firebaseToken = (process.env.FIREBASE_ID_TOKEN || "").trim();

if (!apiBaseUrl) {
  console.error("Missing NEXUM_API_BASE_URL env var.");
  process.exit(1);
}

const hasFirebaseToken = Boolean(firebaseToken);
if (!hasFirebaseToken) {
  console.log("FIREBASE_ID_TOKEN not set; running smoke flow without auth header/cookie.");
}

function authHeaders(extra = {}) {
  if (!hasFirebaseToken) {
    return { ...extra };
  }
  return {
    Authorization: `Bearer ${firebaseToken}`,
    ...extra,
  };
}

async function mustJson(response, label) {
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label}: invalid JSON response (${text.slice(0, 400)})`);
  }
  if (!response.ok) {
    throw new Error(`${label}: HTTP ${response.status} -> ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

async function run() {
  const now = Date.now();
  const payload = {
    nombre: `Smoke Migracion ${now}`,
    descripcion: "Prueba automatizada de flujo migrado",
    ubicacion: "Bogota",
    estado: "en_ejecucion",
    fecha_inicio_planeada: "2026-01-15",
    fecha_fin_planeada: "2026-12-20",
    fecha_inicio_real: "2026-01-20",
    presupuesto_total: 100000000,
    phases: [
      {
        nombre: "Planeacion",
        sort_order: 1,
        fecha_inicio: "2026-01-15",
        fecha_fin: "2026-03-15",
        porcentaje_completado: 20,
        costo: 15000000,
      },
      {
        nombre: "Estructura",
        sort_order: 2,
        fecha_inicio: "2026-03-16",
        fecha_fin: "2026-07-30",
        porcentaje_completado: 10,
        costo: 45000000,
      },
    ],
  };

  const createRes = await fetch(`${apiBaseUrl}/projects`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  const created = await mustJson(createRes, "create_project");
  if (!created.ok || !created.project_id) {
    throw new Error(`create_project: unexpected payload ${JSON.stringify(created)}`);
  }
  const projectId = created.project_id;
  console.log(`Created project: ${projectId}`);

  const agentRes = await fetch(`${nextBaseUrl}/api/proyectos/${projectId}/run-supply-agent`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      mode: "manual",
      dry_run: true,
      horizon_months: 3,
      history_months: 24,
      overrun_threshold_pct: 10,
    }),
  });
  const agent = await mustJson(agentRes, "run_supply_agent");
  console.log(`Agent run status: ${agent.ok ? "ok" : "error"}, run_id=${agent.run_id || "n/a"}`);

  const summaryRes = await fetch(
    `${apiBaseUrl}/dashboard/summary?project_id=${encodeURIComponent(projectId)}`,
    { headers: authHeaders() },
  );
  const summary = await mustJson(summaryRes, "dashboard_summary");
  if (!summary?.project?.id || summary.project.id !== projectId) {
    throw new Error(`dashboard_summary: expected project ${projectId}, got ${JSON.stringify(summary.project)}`);
  }
  console.log(`Dashboard summary OK for project: ${summary.project.nombre}`);

  const dashboardPageRes = await fetch(`${nextBaseUrl}/dashboard/proyectos/${projectId}`, {
    headers: hasFirebaseToken
      ? {
          Cookie: `firebase_id_token=${firebaseToken}`,
        }
      : {},
  });

  if (!dashboardPageRes.ok) {
    const body = await dashboardPageRes.text();
    throw new Error(`dashboard_page: HTTP ${dashboardPageRes.status} -> ${body.slice(0, 400)}`);
  }

  console.log("Dashboard page render OK");
  console.log("Smoke migrated flow passed.");
}

run().catch((error) => {
  console.error(`Smoke migrated flow failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
