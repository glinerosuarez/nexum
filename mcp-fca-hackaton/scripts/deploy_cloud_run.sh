#!/usr/bin/env bash
# Deploy FastMCP server to Cloud Run (public) using Artifact Registry + Cloud SQL.
#
# Required env vars:
#   GCP_PROJECT_ID
#   CLOUD_SQL_INSTANCE
#   DB_NAME
#   DB_USER
#   DB_PASS
#
# Optional env vars:
#   GCP_REGION=us-central1
#   AR_REPO=mcp-agents
#   SERVICE_NAME=mcp-fca-hackaton
#   IMAGE_TAG=latest
#   AGENT_BACKEND=vertex
#   VERTEX_LOCATION=us-central1
#   VERTEX_MODEL=gemini-1.5-pro
#   VERTEX_PROJECT_ID=$GCP_PROJECT_ID

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
: "${CLOUD_SQL_INSTANCE:?CLOUD_SQL_INSTANCE is required}"
: "${DB_NAME:?DB_NAME is required}"
: "${DB_USER:?DB_USER is required}"
: "${DB_PASS:?DB_PASS is required}"

GCP_REGION="${GCP_REGION:-us-central1}"
AR_REPO="${AR_REPO:-mcp-agents}"
SERVICE_NAME="${SERVICE_NAME:-mcp-fca-hackaton}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
AGENT_BACKEND="${AGENT_BACKEND:-vertex}"
VERTEX_LOCATION="${VERTEX_LOCATION:-us-central1}"
VERTEX_MODEL="${VERTEX_MODEL:-gemini-1.5-pro}"
VERTEX_PROJECT_ID="${VERTEX_PROJECT_ID:-$GCP_PROJECT_ID}"

IMAGE_URI="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPO}/${SERVICE_NAME}:${IMAGE_TAG}"

echo "==> Setting gcloud project"
gcloud config set project "$GCP_PROJECT_ID" >/dev/null

echo "==> Enabling required APIs"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  iam.googleapis.com

echo "==> Ensuring Artifact Registry repository exists: ${AR_REPO}"
if ! gcloud artifacts repositories describe "$AR_REPO" --location="$GCP_REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$GCP_REGION" \
    --description="MCP agents images"
fi

echo "==> Building container image: ${IMAGE_URI}"
gcloud builds submit --tag "$IMAGE_URI" .

echo "==> Deploying Cloud Run service: ${SERVICE_NAME}"
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --region "$GCP_REGION" \
  --platform managed \
  --allow-unauthenticated \
  --add-cloudsql-instances "$CLOUD_SQL_INSTANCE" \
  --port 8000 \
  --memory 1Gi \
  --cpu 1 \
  --set-env-vars "CLOUD_SQL_INSTANCE=${CLOUD_SQL_INSTANCE}" \
  --set-env-vars "DB_NAME=${DB_NAME}" \
  --set-env-vars "DB_USER=${DB_USER}" \
  --set-env-vars "DB_PASS=${DB_PASS}" \
  --set-env-vars "AGENT_BACKEND=${AGENT_BACKEND}" \
  --set-env-vars "VERTEX_PROJECT_ID=${VERTEX_PROJECT_ID}" \
  --set-env-vars "VERTEX_LOCATION=${VERTEX_LOCATION}" \
  --set-env-vars "VERTEX_MODEL=${VERTEX_MODEL}" \
  --set-env-vars "PYTHONUNBUFFERED=1"

SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$GCP_REGION" --format='value(status.url)')"
echo ""
echo "✅ Deployed: ${SERVICE_URL}/mcp"
echo "Use this URL as MCP endpoint in your app/agent integration."
