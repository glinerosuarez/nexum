# Google Agent Platform Deployment (Cloud Run + Vertex)

This runbook deploys the MCP server on Google Cloud and connects it as a tool endpoint for your application agent layer.

## 1. Prerequisites

- `gcloud` CLI authenticated with access to a billed project.
- Cloud SQL runtime credentials:
  - `CLOUD_SQL_INSTANCE`
  - `DB_NAME`
  - `DB_USER`
  - `DB_PASS`
- Region: `us-central1`

## 2. Deploy MCP service

```bash
export GCP_PROJECT_ID="<your-project-id>"
export GCP_REGION="us-central1"
export CLOUD_SQL_INSTANCE="<project:region:instance>"
export DB_NAME="<db-name>"
export DB_USER="<db-user>"
export DB_PASS="<db-password>"

./scripts/deploy_cloud_run.sh
```

The script enables APIs, builds the image in Artifact Registry, deploys Cloud Run, and prints:

`https://<service-url>/mcp`

## 3. Runtime configuration used

- `AGENT_BACKEND=vertex`
- `VERTEX_PROJECT_ID=$GCP_PROJECT_ID`
- `VERTEX_LOCATION=us-central1`
- `VERTEX_MODEL=gemini-1.5-pro`

## 4. Smoke test MCP endpoint

Initialize:

```bash
curl -si -X POST "https://<service-url>/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0.0"}}}'
```

Grab `mcp-session-id` from response headers, then call a tool:

```bash
curl -s -X POST "https://<service-url>/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: <session-id>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

## 5. Integrate with app / agent platform

- Configure MCP base URL in your app to `https://<service-url>/mcp`.
- Keep JSON-RPC flow unchanged:
  1. `initialize`
  2. `tools/call`
- For request correlation or downstream auth context, pass the end-user JWT as `access_token` argument on tool calls when needed by your app layer.

## 6. Demo-mode security note

This runbook deploys public unauthenticated Cloud Run for speed. For post-demo hardening:

- Require Cloud Run IAM authentication.
- Move DB credentials to Secret Manager.
- Restrict ingress and caller identities.
