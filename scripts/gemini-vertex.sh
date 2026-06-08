#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export CLOUDSDK_CONFIG="${CLOUDSDK_CONFIG:-/private/tmp/codex-gcloud}"
export GOOGLE_APPLICATION_CREDENTIALS="${GOOGLE_APPLICATION_CREDENTIALS:-$CLOUDSDK_CONFIG/application_default_credentials.json}"
export GOOGLE_GENAI_USE_VERTEXAI="${GOOGLE_GENAI_USE_VERTEXAI:-true}"
export GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT:-nexum-497302}"
export GOOGLE_CLOUD_LOCATION="${GOOGLE_CLOUD_LOCATION:-global}"
export GEMINI_MODEL="${GEMINI_MODEL:-gemini-3-flash-preview}"
export GEMINI_CLI_TRUST_WORKSPACE="${GEMINI_CLI_TRUST_WORKSPACE:-true}"

if [[ ! -f "$GOOGLE_APPLICATION_CREDENTIALS" ]]; then
  cat >&2 <<EOF
Missing Vertex AI Application Default Credentials at:
  $GOOGLE_APPLICATION_CREDENTIALS

Run this once, then rerun the script:
  CLOUDSDK_CONFIG=$CLOUDSDK_CONFIG gcloud auth application-default login --no-launch-browser
EOF
  exit 1
fi

exec gemini "$@"
