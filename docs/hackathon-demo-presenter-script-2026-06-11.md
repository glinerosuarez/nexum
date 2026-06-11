# Hackathon Demo Presenter Script

Date: 2026-06-11

Use this as the spoken version during recording.  
Target pace: calm, direct, around 2 minutes 30 seconds to 2 minutes 50 seconds.

## Opening

`Construction is a massive part of the Colombian economy, but project execution is still highly inefficient. In our research, we highlighted that 77 percent of large projects suffer major delays, and 98 percent of megaprojects exceed budget by more than 30 percent.`

`That is the environment where hidden supply risk becomes expensive.`

## Landing To New Project

`Nexum starts where project teams already work: contract, schedule, and budget documents that do not arrive in a clean operational format.`

`We ingest those messy project files, detect the structured signals that matter, and use them to initialize the supply intelligence workflow.`

## Executive View

`From there, Nexum turns project scope into an operational view of critical supply exposure, scarcity signals, and budget-sensitive risk.`

`Instead of generic document parsing, the output is already organized around project decisions.`

`Behind this screen, our web app calls nexum-api, which runs a supply intelligence agent orchestrated with Google ADK on Vertex Gemini.`

`That agent reads the project inputs, extracts candidate supplies, qualifies the real ones, preserves their semantic meaning, and maps them into the monitoring layer that drives these executive signals.`

## Critical Supplies View

`Here we can inspect the supply layer directly.`

`The agent identifies which supplies are critical, what availability risk they carry, and how much project exposure depends on them.`

`Those forecasts give project managers time to take preemptive actions before scarcity turns into cost overruns or schedule delays.`

`This is where we care about semantic truth, not just volume.`

## Chat View

`We also expose that same project intelligence through chat, so a user can query costs, progress, forecast, and supply risk using the structured context created by the agent.`

## Phoenix

`This is the live run in Phoenix.`

`It proves that the workflow is actually running through Google ADK with Gemini, not just calling a model in isolation.`

`You can see the orchestration span, the agent invocation, the LLM call, and the Gemini generation step.`

## Metrics

`For this run, the workflow evaluated 166 candidates, qualified 51 real supplies, preserved 51 shadow supplies, mapped 40, and intentionally left 11 unresolved.`

`That last part matters, because we stopped forcing weak mappings once Phoenix showed they were misleading.`

## Improvement Story

`Phoenix did more than confirm the run succeeded.`

`It showed us where the agent was semantically weak, so we improved the supply understanding layer.`

`We used Phoenix to make the agent more truthful, not just more confident.`

## Close

`The result is a practical supply intelligence workflow for construction projects: better extraction from real project inputs, better semantic precision, and a measurable improvement loop on Google Cloud with Arize Phoenix.`

## Shorter Backup Version

If you need to speak faster, use this:

`Construction projects hide critical supply risk inside messy documents. Nexum uses a Google ADK agent with Gemini to extract and structure that supply intelligence, and Arize Phoenix gives us the loop to improve its truthfulness. The result is better project visibility, better semantic precision, and more honest decision support.`
