# Hackathon Demo Plan

Date: 2026-06-10

## Goal
Show a sub-3-minute demo that is easy for judges to follow and proves three things:

1. Nexum solves a real project-supply intelligence problem.
2. The live workflow is built on the required Google stack.
3. Arize Phoenix helped us improve retrieval truthfulness, not just produce prettier outputs.

## Demo Thesis
The strongest demo is not generic forecasting.

The strongest demo is:

1. a real construction project gets processed end to end
2. Nexum surfaces hidden supply intelligence from messy contractual inputs
3. the live supply workflow is orchestrated by Google ADK with Gemini on Vertex
4. Phoenix shows the iteration loop that improved semantic retrieval quality

## What We Should Show

### Act 1: Problem And Product
Open on the live Nexum app and frame the problem in one sentence:

`Construction project scope hides critical supplies inside inconsistent contractual documents, so teams miss what they need to monitor early.`

Then show:

1. project page / executive view
2. the fact that a benchmark/project run completed successfully
3. the product framing:
   - Nexum reads project input artifacts
   - extracts supply candidates
   - qualifies the real supplies
   - preserves semantic meaning for downstream decision support

### Act 2: Live Agent Story
Explain the actual live runtime path:

`Nexum web -> nexum-api -> Google ADK supply agent -> MCP/data tools -> Phoenix`

What to emphasize verbally:

1. the supply workflow itself is the agent
2. Gemini is the model
3. Google ADK is the orchestration framework
4. MCP is the execution boundary for tools and data access

Do not spend time on older orchestration history or LangGraph.

### Act 3: Phoenix Evidence
This is the differentiator.

Open Phoenix on the latest successful ADK-backed run and show:

1. the `agentic_shadow_run` root trace
2. the ADK-specific spans:
   - `agent_platform_orchestration`
   - `invoke_agent nexum_supply_intelligence_agent`
   - `call_llm`
   - `generate_content gemini-2.5-flash`
3. the preserved supply workflow metrics:
   - `candidate_count = 166`
   - `qualified_supply_count = 51`
   - `shadow_supply_count = 51`
   - `mapped_shadow_supply_count = 40`
   - `unmapped_shadow_supply_count = 11`

Then make the product point:

`Phoenix did not just tell us that a run succeeded. It showed us where semantic truth was weak, so we improved the supply understanding layer.`

### Act 4: Iteration Story
Use one simple before/after story, not the whole history.

Recommended narrative:

1. earlier runs were forcing weak mappings and hiding semantic mistakes
2. Phoenix exposed bad classifications and empty semantic labels
3. we changed the workflow to preserve `supply_class` and improve class precision
4. now the system can say things like:
   - this is a `grab_bar`
   - this is a `hook`
   - this is a `masonry_wall`
   - this is an `electrical_feeder`
5. and it can keep some downstream forecast mappings unresolved when they would be misleading

Best one-line framing:

`We used Phoenix to make the agent more truthful, not just more confident.`

### Act 5: Close
End on the business value:

1. better retrieval recall from real project inputs
2. better semantic supply understanding
3. a measurable improvement loop on Google Cloud with Arize Phoenix

## Recommended Run To Reference
Use this successful live run as the primary Phoenix evidence point:

- project id: `b7697793-0ab9-4b50-859c-7b86448d0f1b`
- input batch / session id: `91c448fb-a334-48f6-9514-b96e496f6440`
- `agentic_shadow` trace: `76cfb1bbb0421f4d32b20453901e32a9`
- `material_price_forecast` trace: `8afe76f67261c567b77fc6cdc847d4fb`
- backend revision: `nexum-api-00054-kpj`

Key ADK proof points from that run:

1. `shadow.orchestrator = adk`
2. `agent_platform.backend = vertex_ai_agent_builder_adk`
3. `agent_platform.framework = google_adk`
4. `llm.model_name = gemini-2.5-flash`
5. `gen_ai.agent.name = nexum_supply_intelligence_agent`

## On-Screen Sequence
Keep this sequence tight.

1. Live Nexum project page
2. One sentence on the problem
3. One sentence on the architecture
4. Phoenix trace for the successful run
5. Highlight ADK spans and core counts
6. Highlight one semantic precision takeaway
7. Close on why this matters for project decision support

## What Not To Show

1. Do not spend demo time on old failed revisions unless asked.
2. Do not lead with generic forecast charts.
3. Do not show internal code unless the submission format explicitly benefits from it.
4. Do not explain every semantic class refinement.
5. Do not mention LangGraph in the main demo path.

## Backup Plan
If the live app is slow or unreliable during recording:

1. keep the hosted app as the opening shot
2. move quickly to Phoenix, where the successful traces are already captured
3. use the successful ADK-backed run above as the main proof artifact

If Phoenix UI is awkward:

1. pre-open the exact session
2. have the trace ids copied in notes
3. use one screenshot as fallback, but prefer the live trace if possible

## Speaking Outline

### Opening
`Nexum helps construction teams uncover critical supplies hidden in project scope before those blind spots become budget and execution risk.`

### Architecture
`In the live workflow, our web app calls a backend supply agent orchestrated with Google ADK on Vertex Gemini, which executes through MCP-connected tools and is traced end to end in Arize Phoenix.`

### Improvement Story
`Phoenix let us see not just whether the run succeeded, but whether the agent was classifying supplies truthfully. That let us improve semantic supply understanding instead of forcing misleading downstream mappings.`

### Close
`The result is a more honest and more useful supply-intelligence workflow: better extraction, better semantics, and a measurable iteration loop on Google Cloud.`

## Recording Checklist

1. Be logged into the live app.
2. Be logged into Phoenix with the successful run already open.
3. Hide irrelevant tabs and bookmarks.
4. Use browser zoom large enough for trace labels to be readable.
5. Keep the total recording under 3 minutes.
6. Record one clean take and one backup take.

## Optional Screens To Prepare In Advance

1. Nexum project executive view after a successful run
2. Phoenix trace tree showing `agent_platform_orchestration`
3. Phoenix attributes panel showing:
   - `shadow.orchestrator = adk`
   - `agent_platform.framework = google_adk`
   - `candidate_count = 166`
   - `qualified_supply_count = 51`
