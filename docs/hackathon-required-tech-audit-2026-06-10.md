# Hackathon Required-Tech Audit

Date: 2026-06-10

## Verdict

Current repo evidence supports:

1. `Gemini`: yes
2. `Google Cloud runtime`: yes
3. `Partner MCP server`: yes
4. `Arize/Phoenix partner story`: yes
5. `Google Cloud Agent Builder`: **not yet proven in this repo**

That last item is the current submission-compliance risk.

## What The Repo Clearly Proves

### 1. Gemini is called at runtime

The repo contains direct runtime calls to Vertex-backed Gemini models:

- [agent.py](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/mcp-fca-hackaton/domain/agent/agent.py:351)
  - `create_vertex_agent()` imports `ChatVertexAI`
  - builds a Vertex-backed ReAct agent
- [agent.py](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/mcp-fca-hackaton/domain/agent/agent.py:356)
  - runtime model instantiation uses `ChatVertexAI(...)`
- [project_input_agentic.py](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/mcp-fca-hackaton/nexum_api/project_input_agentic.py:688)
  - extraction path imports `ChatVertexAI`
- [project_input_agentic.py](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/mcp-fca-hackaton/nexum_api/project_input_agentic.py:690)
  - live shadow extraction invokes the Vertex model

Dependency evidence:

- [pyproject.toml](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/mcp-fca-hackaton/pyproject.toml:17)
  - `langchain-google-vertexai>=2.0.0`
- [pyproject.toml](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/mcp-fca-hackaton/pyproject.toml:19)
  - `google-cloud-aiplatform>=1.70.0`

### 2. Google Cloud runtime is real

The repo is not only naming Google Cloud. It is built and deployed around it:

- Cloud Run deployment/config assets exist under `cloudbuild` and `infra/gcp`
- Vertex model configuration is used in runtime code, not just docs
- the active backend path depends on Google Cloud ADC / Vertex configuration

## 3. MCP server usage is real

The project contains a real MCP server and a backend that calls it:

- [server.py](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/mcp-fca-hackaton/server.py:9)
  - imports `FastMCP`
- [server.py](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/mcp-fca-hackaton/server.py:56)
  - initializes the MCP server
- [app.py](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/mcp-fca-hackaton/nexum_api/app.py:100)
  - resolves `SUPPLY_AGENT_MCP_URL`
- [app.py](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/mcp-fca-hackaton/nexum_api/app.py:1028)
  - fails hard if the MCP URL is not configured

That is strong evidence that MCP is part of the real runtime contract.

### 4. Arize / Phoenix evidence is real

Partner-track observability and iteration evidence is both implemented and documented:

- `domain/observability/arize_tracing.py`
- [hackathon-pitch-phoenix-insights.md](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/docs/hackathon-pitch-phoenix-insights.md)
- [block2-subplan-phoenix-iteration-comparison.md](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/docs/block2-subplan-phoenix-iteration-comparison.md)

## What The Repo Does Not Yet Prove

I found no code evidence for any of the following Agent Builder style runtime surfaces:

1. Vertex AI Agent Builder APIs
2. Agent Engine / Managed Agents API calls
3. Agent Development Kit usage
4. Discovery Engine / Vertex AI Search integration
5. Dialogflow or related Agent Builder runtime usage
6. Reasoning Engine / agent platform runtime objects

The targeted repo scan found:

- no `agent builder` references
- no `discoveryengine` imports
- no `dialogflow` imports
- no `agent engine` or `reasoning engine` classes
- no ADK-related code

The current runtime stack is closer to:

`LangGraph + Vertex Gemini + FastMCP + Cloud Run + Phoenix`

which is credible and functional, but is not the same as proving `Google Cloud Agent Builder` usage.

## Why This Matters

The hackathon reminder was explicit:

`Your project must use Gemini + Google Cloud Agent Builder + your chosen partner's MCP server`

If judges enforce that literally, the current repo is exposed.

## Current Recommendation

Treat Agent Builder as the highest-priority compliance decision before final submission.

There are only two honest paths:

1. **Prove it exists already**
   - only possible if there is another runtime surface or branch we have not yet audited
2. **Add a minimal real integration now**
   - the integration must be imported and called at runtime
   - README mention alone is not enough

## Fastest Next Audit Step

If we continue on this thread, the next concrete task should be:

1. inspect whether any external service or sibling repo contains the Agent Builder path that is not yet vendored here
2. if not, decide immediately whether to implement a minimal Agent Builder runtime slice tonight

## External Documentation Note

Current Google Cloud documentation distinguishes ordinary Vertex/Gemini usage from Vertex AI Agent Builder / Agent Engine style usage.

In other words:

`using ChatVertexAI with Gemini does not, by itself, prove Agent Builder`

That is the standard we should use for the final submission.
