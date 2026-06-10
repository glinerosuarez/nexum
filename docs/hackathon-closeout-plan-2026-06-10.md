# Hackathon Closeout Plan

Date: 2026-06-10

Deadline: 2026-06-11 2:00 PM PT

## Goal
Submit a judge-ready Nexum project that is live, reviewable, and clearly compliant with the Rapid Agent Hackathon requirements.

This closeout plan is intentionally submission-first, not roadmap-first. The remaining work should optimize for:

1. judges being able to open the live product
2. judges being able to verify the required runtime stack
3. judges being able to understand the product story in under three minutes
4. the repo being complete enough that the submission is not disqualified on packaging mistakes

## Current Repo-Grounded Status

What is already in place:

1. Monorepo deliverable is consolidated in `Nexum-IA`.
2. Root [README.md](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/README.md) exists and includes setup and deployment guidance.
3. Hosted app and backend have been actively deployed on Cloud Run during live validation.
4. MCP runtime is present under [mcp-fca-hackaton](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/mcp-fca-hackaton).
5. Phoenix/Arize iteration evidence and pitch notes already exist in:
   - [hackathon-pitch-phoenix-insights.md](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/docs/hackathon-pitch-phoenix-insights.md)
   - [block2-subplan-phoenix-iteration-comparison.md](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/docs/block2-subplan-phoenix-iteration-comparison.md)
6. Git remote is already pointed at the public GitHub target:
   - `https://github.com/glinerosuarez/nexum.git`

What is currently missing or risky:

1. There is no root `LICENSE` file in `baqhack/Nexum-IA`.
2. The current README is more like a monorepo technical overview than a judge-facing submission README.
3. We have strong repo evidence for Gemini, Cloud Run, MCP, and Phoenix/Arize, and the chosen compliance fix is now to make the supply extraction workflow itself run under Google ADK orchestration.
4. Demo assets are not yet formalized in-repo:
   - final 3-minute script
   - final submission text block
   - final proof checklist
5. Hosted URL verification still needs one fresh pre-submission check from an incognito or logged-out browser.

## Closeout Priorities

### P0: Submission Blockers

These are the items that can disqualify or weaken the submission even if the product works.

1. Add an OSI-approved `LICENSE` file at the repo root.
2. Rewrite the root README opening so it reads like a hackathon submission:
   - what Nexum does
   - who it is for
   - why it matters
   - architecture summary
   - setup and run instructions
   - hosted URL
   - demo flow
3. Verify the public repo state:
   - repo reachable in incognito
   - license visible on GitHub
   - About section updated on GitHub if needed
4. Confirm the exact required-tech story is defensible:
   - Gemini is called at runtime
   - Google Cloud services are called at runtime
   - partner MCP server story is explicit and backed by code
   - the supply extraction workflow itself is orchestrated by Google ADK / Agent Platform in the live deployed path
5. Confirm the hosted project URL is stable and points to the live app, not a stale or internal endpoint.

### P1: Judge Narrative Package

1. Create a short submission summary with:
   - problem
   - solution
   - key features
   - architecture
   - partner-track story
   - learnings
2. Create the final demo script for a sub-3-minute walkthrough.
3. Capture 2-3 product screenshots plus 1 Phoenix screenshot that supports the iteration story.
4. Make sure all team members and the selected partner track are ready to enter into the submission form.

### P2: Nice-To-Have But Not Required

1. One last semantic-class iteration only if it directly improves the live demo.
2. A tighter README architecture diagram or simple flow diagram.
3. A lightweight preflight script for repetitive checks.

## Required-Tech Evidence Pass

Before submission, we should be able to point judges to exact code/runtime surfaces for each required technology.

### Already visible in the repo

1. Gemini / Google AI model usage:
   - `mcp-fca-hackaton/domain/agent/agent.py`
   - `mcp-fca-hackaton/nexum_api/project_input_agentic.py`
   - `app/dashboard/proyectos/nuevo/actions.ts`
2. Google Cloud runtime:
   - Cloud Run deployment config
   - Vertex-compatible configuration in the root README
   - `cloudbuild` and `infra/gcp` assets
3. MCP server usage:
   - `mcp-fca-hackaton/server.py`
   - `SUPPLY_AGENT_MCP_URL` integration in `nexum_api/app.py`
4. Arize / Phoenix partner-story evidence:
   - `domain/observability/arize_tracing.py`
   - Phoenix iteration docs in `docs/`

### Chosen resolution

1. The judge-facing supply workflow should not remain under LangGraph orchestration.
2. The repo is now pivoting to use Google ADK as the orchestration layer for `POST /project-input-batches/{input_batch_id}/agentic-shadow-runs/run`.
3. Existing extraction, qualification, normalization, mapping, persistence, and Phoenix spans stay intact as domain logic.
4. The framework swap is only at the orchestration boundary so the live demo path stays stable.

## Execution Order

### Phase 1: Hardening The Submission Package

1. Add `LICENSE`.
2. Rewrite the root README for judges.
3. Create a concise submission brief in `docs/`.
4. Create a final demo runbook in `docs/`.

### Phase 2: Compliance Verification

1. Verify runtime proof for Gemini.
2. Verify runtime proof for Google Cloud services.
3. Verify runtime proof for MCP usage.
4. Verify partner track selection and narrative.
5. Deploy and verify the ADK-orchestrated supply workflow.

### Phase 3: Live Readiness

1. Open the hosted app from a clean browser state.
2. Run the recommended demo path end to end.
3. Verify the repo link from a logged-out browser.
4. Verify the video link and visibility.

### Phase 4: Final Submission

1. Paste the final description text.
2. Paste the hosted URL.
3. Paste the public repo URL.
4. Paste the public video URL.
5. Select partner track.
6. Add all team members.
7. Re-open the submission once before the deadline and verify nothing regressed.

## Suggested Artifacts To Produce Tonight

1. `LICENSE`
2. README rewrite
3. `docs/hackathon-submission-brief.md`
4. `docs/hackathon-demo-runbook.md`
5. `docs/hackathon-submission-checklist.md`

## Working Assumptions

1. The live product URL is already deployable and has been exercised recently, but still needs a final clean-browser verification.
2. The strongest differentiator in the pitch is not generic forecasting. It is the Phoenix-backed iteration loop that improved retrieval truthfulness and semantic supply understanding.
3. The safest final demo is one that shows:
   - project creation
   - supply intelligence run
   - dashboard result
   - one Phoenix comparison/evidence view
4. We should avoid large new feature work unless it directly fixes a compliance blocker or demo-breaker.

## Immediate Next Actions

1. Add the root `LICENSE`.
2. Deploy the ADK-orchestrated supply workflow.
3. Verify Phoenix on one fresh run and capture proof.
4. Rewrite the root README into a judge-facing submission README.
5. Create the final submission brief and demo runbook.
