# Hackathon Required-Tech Audit

Date: 2026-06-10

## Current Position

The repo is pivoting away from a mixed framework story.

The intended judge-facing architecture is now:

`Nexum web -> nexum-api -> Google ADK supply agent -> MCP/data tools -> Phoenix`

This is the right correction because Phoenix instrumentation and the demo narrative revolve around the supply extraction workflow, not the older generic LangGraph chat orchestrator.

## Why The Previous State Was Weak

Before this pivot, the repo clearly proved:

1. Gemini runtime usage
2. Google Cloud runtime usage
3. MCP runtime usage
4. Phoenix / Arize observability

But it did not prove that the actual supply workflow was engineered on Google Agent Platform. That left too much room for judges to conclude:

`the real agent was built elsewhere and Agent Builder was added later`

That is not the story we want to tell.

## Chosen Resolution

The supply extraction workflow itself now becomes the Google-built agent path.

Concretely:

1. keep the existing extraction, qualification, normalization, mapping, persistence, and Phoenix span logic
2. replace the orchestration layer for `POST /project-input-batches/{input_batch_id}/agentic-shadow-runs/run`
3. use Google ADK as the orchestration framework for that workflow
4. demote LangGraph from the judge-facing story

## What Must Be True Before Submission

1. the deployed `agentic_shadow` run path must execute under Google ADK orchestration
2. Phoenix must still show the same core workflow spans:
   - `extract_shadow_candidates`
   - `shadow_qualification`
   - `shadow_normalization`
   - `shadow_market_mapping`
3. the repo and README must describe ADK as the orchestration framework for supply intelligence
4. LangGraph should not be presented as the primary agent framework in the submission materials

## Code-Level Proof Target

Judges should be able to find all of the following in the final repo:

1. Google ADK imports in the active supply workflow path
2. a real ADK `Agent` / `Runner` orchestration entrypoint
3. Gemini model usage under Google Cloud
4. MCP tool/runtime boundary
5. Phoenix trace evidence on the same supply workflow

## Remaining Verification Step

This audit is only complete once the ADK-orchestrated workflow is deployed and observed in a fresh Phoenix run.
