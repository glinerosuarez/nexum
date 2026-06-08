#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${NEXUM_API_SERVICE_NAME:-nexum-api}"
REPO="${ARTIFACT_REPOSITORY:-nexum}"
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:?Set FIREBASE_PROJECT_ID}"
SUPPLY_AGENT_MCP_URL="${SUPPLY_AGENT_MCP_URL:?Set SUPPLY_AGENT_MCP_URL}"
SUPPLY_AGENT_MCP_REQUIRED="${SUPPLY_AGENT_MCP_REQUIRED:-true}"
SUPPLY_AGENT_MCP_TIMEOUT_MS="${SUPPLY_AGENT_MCP_TIMEOUT_MS:-90000}"
SUPPLY_AGENT_MCP_BEARER="${SUPPLY_AGENT_MCP_BEARER:-}"
PHOENIX_PROJECT_NAME="${PHOENIX_PROJECT_NAME:-nexum-supply-intelligence}"
PHOENIX_API_KEY_SECRET="${PHOENIX_API_KEY_SECRET:-nexum-phoenix-api-key}"
: "${PHOENIX_COLLECTOR_ENDPOINT:?Set PHOENIX_COLLECTOR_ENDPOINT}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE_NAME}:$(date +%Y%m%d-%H%M%S)"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BUILD_CONFIG="$(mktemp)"
trap 'rm -f "$BUILD_CONFIG"' EXIT

cat >"$BUILD_CONFIG" <<EOF
steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - -f
      - Dockerfile.nexum_api
      - -t
      - ${IMAGE}
      - .
  - name: gcr.io/cloud-builders/docker
    args:
      - push
      - ${IMAGE}
images:
  - ${IMAGE}
EOF

gcloud builds submit --project "$PROJECT_ID" --config "$BUILD_CONFIG" .

ENV_VARS="FIREBASE_AUTH_REQUIRED=true,FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID},SUPPLY_AGENT_MCP_URL=${SUPPLY_AGENT_MCP_URL},SUPPLY_AGENT_MCP_REQUIRED=${SUPPLY_AGENT_MCP_REQUIRED},SUPPLY_AGENT_MCP_TIMEOUT_MS=${SUPPLY_AGENT_MCP_TIMEOUT_MS}"
if [[ -n "$SUPPLY_AGENT_MCP_BEARER" ]]; then
  ENV_VARS="${ENV_VARS},SUPPLY_AGENT_MCP_BEARER=${SUPPLY_AGENT_MCP_BEARER}"
fi
ENV_VARS="${ENV_VARS},PHOENIX_PROJECT_NAME=${PHOENIX_PROJECT_NAME},PHOENIX_COLLECTOR_ENDPOINT=${PHOENIX_COLLECTOR_ENDPOINT}"

gcloud run deploy "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "$IMAGE" \
  --allow-unauthenticated \
  --port 8080 \
  --update-env-vars "$ENV_VARS" \
  --update-secrets "PHOENIX_API_KEY=${PHOENIX_API_KEY_SECRET}:latest"

echo "Deployed ${SERVICE_NAME} to ${REGION}."
