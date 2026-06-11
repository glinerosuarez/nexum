# Hackathon Demo Script

Date: 2026-06-11

Target length: 2 minutes 30 seconds to 2 minutes 50 seconds

Primary objective:
Show one clean story:

1. Nexum reads messy construction project inputs
2. a Google ADK agent extracts and structures critical supply intelligence
3. Arize Phoenix helped us improve retrieval truthfulness and semantic precision

## Demo Setup

Keep these tabs ready before recording:

1. live Nexum landing page
2. live Nexum projects / new project flow
3. live Nexum project executive view
4. live Nexum critical supplies view
5. live Nexum chat view
6. Phoenix trace for the successful ADK-backed run

Recommended live pages:

1. Landing page  
`https://nexum-web-xhlpjxjnva-uc.a.run.app/`

2. Projects / new project flow  
`https://nexum-web-xhlpjxjnva-uc.a.run.app/dashboard/proyectos/nuevo`

3. Executive view  
`https://nexum-web-xhlpjxjnva-uc.a.run.app/dashboard/proyectos/b7697793-0ab9-4b50-859c-7b86448d0f1b?created=1`

4. Critical supplies view  
`https://nexum-web-xhlpjxjnva-uc.a.run.app/dashboard/proyectos/0af98ada-4db7-4312-97d2-a37103228718/insumos`

5. Chat view  
`https://nexum-web-xhlpjxjnva-uc.a.run.app/dashboard/proyectos/0af98ada-4db7-4312-97d2-a37103228718/chat`

6. Phoenix evidence run  
Project: `b7697793-0ab9-4b50-859c-7b86448d0f1b`  
Session / input batch: `91c448fb-a334-48f6-9514-b96e496f6440`  
`agentic_shadow` trace: `76cfb1bbb0421f4d32b20453901e32a9`

## Recording Notes

1. Record at 125 percent browser zoom or higher.
2. Start with the app already loaded.
3. Keep cursor movement deliberate and slow.
4. Do not type live unless the app is fully stable.
5. If a page takes too long, cut immediately to the next prepared tab.

## Shot List

### Shot 1: Market Problem

Time: `0:00 - 0:20`

On screen:

1. Open the landing page or your prepared problem slide.
2. If using the slide, keep the four statistics visible.
3. Do not scroll yet.

Say:

`Construction is a massive part of the Colombian economy, but project execution is still highly inefficient. In our research, we highlighted three signals: seventy-seven percent of large projects suffer major schedule delays, more than ninety percent of active projects show delays or cost overruns, and globally ninety-eight percent of megaprojects exceed budget by more than thirty percent.`

Optional shorter line:

`This is exactly the environment where hidden supply risk becomes expensive.`

### Shot 2: Product Entry

Time: `0:20 - 0:40`

On screen:

1. Go from the landing page into the app.
2. Open the projects view.
3. Enter the new-project flow.
4. If you speed this section up in editing, keep the transitions readable.

Say:

`Nexum starts where project teams already work: with contract, schedule, and budget documents that do not arrive in a clean operational format.`

### Shot 3: Create New Project

Time: `0:40 - 0:55`

On screen:

1. Show the new-project screen.
2. Briefly show the detected data card.
3. Do not stay long on the form.

Say:

`We ingest messy project files, detect the structured signals that matter, and use them to initialize the supply intelligence workflow.`

### Shot 4: Executive View And Architecture

Time: `0:55 - 1:15`

On screen:

1. Open the executive view of the prepared project.
2. Keep the KPI cards, alerts, and projection curve visible.

Say:

`From there, Nexum turns project scope into an operational view of critical supply exposure, scarcity signals, and budget-sensitive risk.`

`Behind this screen, our web app calls nexum-api, which runs a supply intelligence agent orchestrated with Google ADK on Vertex Gemini.`

`That agent reads the project inputs, extracts candidate supplies, qualifies the real ones, preserves their semantic meaning, and maps them into the monitoring layer that drives these executive signals.`

### Shot 5: Critical Supplies View

Time: `1:15 - 1:35`

On screen:

1. Switch to the critical supplies view.
2. Show the translated table and the agent summary row.
3. Let the first few rows remain visible.

Say:

`Here we can inspect the supply layer directly. The agent identifies critical supply groups, availability status, budget exposure, and the monitored set that will drive downstream decisions.`

`Those forecasts give project managers time to take preemptive actions before scarcity turns into cost overruns or schedule delays.`

Optional emphasis:

`This is where we want semantic truth, not inflated confidence.`

### Shot 6: Chat Surface

Time: `1:35 - 1:50`

On screen:

1. Switch to the chat view.
2. Show the translated interface.
3. Do not rely on a live answer unless the system is fully responsive.

Say:

`We also expose that project intelligence through a chat interface so a user can query costs, progress, forecast, and supply risk using the same structured project context.`

### Shot 7: Phoenix Proof

Time: `1:50 - 2:15`

On screen:

1. Switch to Phoenix.
2. Open trace `76cfb1bbb0421f4d32b20453901e32a9`.
3. Show the trace tree first.
4. Highlight these spans:
   - `agent_platform_orchestration`
   - `invoke_agent nexum_supply_intelligence_agent`
   - `call_llm`
   - `generate_content gemini-2.5-flash`

Say:

`This is the live run in Phoenix. It proves the workflow is actually running through Google ADK with Gemini, not just calling a model in isolation.`

### Shot 8: Metrics And Improvement Loop

Time: `2:15 - 2:40`

On screen:

1. In Phoenix, show the attributes panel.
2. Call out these values:
   - `candidate_count = 166`
   - `qualified_supply_count = 51`
   - `shadow_supply_count = 51`
   - `mapped_shadow_supply_count = 40`
   - `unmapped_shadow_supply_count = 11`
3. If available, show `shadow.orchestrator = adk` and `agent_platform.framework = google_adk`.

Say:

`Phoenix did more than confirm the run succeeded. It showed us where the agent was semantically weak, so we improved the supply understanding layer. We used it to make the agent more truthful, not just more confident.`

### Shot 9: Close

Time: `2:40 - 2:55`

On screen:

1. End either on Phoenix or switch back to the executive view.
2. Keep the screen still.

Say:

`The result is a practical supply intelligence workflow for construction projects: better extraction from real project inputs, better semantic precision, and a measurable iteration loop on Google Cloud with Arize Phoenix.`

## Shorter Backup Version

If time is tight, use this compressed sequence:

1. Landing / problem frame
2. Executive view
3. Phoenix trace
4. Close

Compressed close line:

`Nexum turns messy construction scope into critical supply intelligence, and Phoenix gave us the loop to improve that agent truthfully on Google Cloud.`

## What To Avoid In The Recording

1. Do not mention LangGraph.
2. Do not explain old failed revisions.
3. Do not spend time on the costs page.
4. Do not lead with generic forecast charts.
5. Do not apologize for unresolved market mappings. Frame them as intentional honesty.

## Exact One-Line Value Prop

If you need one sentence for the submission or intro:

`Nexum uses a Google ADK agent with Gemini to uncover critical supplies hidden in construction project documents, and Arize Phoenix to measurably improve the truthfulness of that supply intelligence.`
