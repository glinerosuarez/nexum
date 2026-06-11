# Nexum

Nexum is a construction supply-intelligence platform for project teams that need earlier visibility into critical material risk.

It ingests messy project inputs such as schedules, budgets, and contractual scope documents, then uses a Google ADK agent with Gemini on Vertex AI to extract, classify, and monitor the supplies that can create budget overruns or schedule delays. Arize Phoenix is used to trace the workflow and improve the truthfulness of the agent over time.

## Why It Matters

Construction teams often discover critical supply risk too late because the relevant signals are buried across disconnected files and inconsistent naming.

Nexum solves that by:

1. reading project source documents
2. extracting candidate supplies
3. qualifying real supplies
4. preserving semantic supply meaning
5. surfacing executive risk signals such as scarcity alerts and critical exposure

## Hackathon Stack

This project uses the required stack at runtime:

- `Gemini` on `Google Cloud Vertex AI`
- `Google ADK` as the live supply-agent orchestration framework
- `MCP` as the tool and execution boundary
- `Arize Phoenix` as the observability and improvement loop
- `Cloud Run` for deployment
- `Cloud SQL` for persistence

## Live Demo

- Hosted app: `https://nexum-web-xhlpjxjnva-uc.a.run.app`
- Backend API: `https://nexum-api-xhlpjxjnva-uc.a.run.app`

## Demo Flow

The strongest demo path is:

1. landing page
2. create a new project from uploaded files
3. executive view
4. critical supplies view
5. chat view
6. Phoenix trace showing the ADK-backed run

## Architecture

High-level runtime path:

`Nexum web -> nexum-api -> Google ADK supply agent -> MCP-connected tools/data -> Phoenix`

The live supply workflow is the agent. It is not a side assistant.

At a high level, the agent:

1. reads project inputs
2. extracts supply candidates
3. qualifies real supplies
4. preserves semantic supply classes
5. maps the useful subset into monitoring and risk signals

## Repository Layout

This repository is the hackathon monorepo:

```text
app/                  Next.js web app
components/           UI components
lib/                  frontend data loaders, formatting, i18n helpers
mcp-fca-hackaton/     nexum-api backend, MCP runtime, Cloud SQL logic, agent workflow
infra/                infrastructure assets
docs/                 plans, demo scripts, and hackathon notes
```

## Local Setup

Requirements:

- Node.js 20+
- npm

Install and run the web app:

```bash
npm install
npm run dev
```

Open:

`http://localhost:3000`

## Key Commands

```bash
npm run dev
npm run build
npx tsc --noEmit
```

Backend runtime lives in `mcp-fca-hackaton/`.

## Deployment

The web app is deployed to Cloud Run using:

- `cloudbuild.web.yaml`
- Docker-based Next.js build

The backend runtime is deployed separately from:

- `mcp-fca-hackaton/cloudbuild.nexum-api.yaml`

## What Phoenix Helped Us Improve

Phoenix was not only used to confirm success or failure.

It exposed where the supply workflow was semantically weak, which let us improve:

- retrieval recall
- supply classification truthfulness
- separation between semantic supply understanding and downstream forecast usability

The key product principle is:

`better retrieval is not the same as better forecasting`

That is why the workflow now prefers preserving truthful `supply_class` labels instead of forcing misleading market mappings.

## Submission Notes

Partner track:

- `Arize`

Core value proposition:

`Nexum uses a Google ADK agent with Gemini to uncover critical supplies hidden in construction project documents, and Arize Phoenix to measurably improve the truthfulness of that supply intelligence.`
