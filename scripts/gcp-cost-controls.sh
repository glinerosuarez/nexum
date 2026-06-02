#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-nexum-497302}"
REGION="${REGION:-us-central1}"
DB_INSTANCE="${DB_INSTANCE:-nexum-postgres}"
RUN_SERVICES="${RUN_SERVICES:-nexum-api nexum-web mcp-fca-hackaton}"
WAKE_MIN_INSTANCES="${WAKE_MIN_INSTANCES:-0}"

log() {
  printf '[gcp-cost] %s\n' "$*"
}

warn() {
  printf '[gcp-cost][warn] %s\n' "$*" >&2
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

run_services_array() {
  local items="$1"
  read -r -a SERVICES <<< "$items"
}

sql_status() {
  gcloud sql instances describe "$DB_INSTANCE" \
    --project="$PROJECT_ID" \
    --format='value(state,settings.activationPolicy)' 2>/dev/null || true
}

run_min_instances() {
  local service="$1"
  local value
  value="$(gcloud run services describe "$service" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --format='value(spec.template.scaling.minInstanceCount)' 2>/dev/null || true)"
  if [[ -z "$value" ]]; then
    value="0"
  fi
  printf '%s' "$value"
}

status() {
  log "project=${PROJECT_ID} region=${REGION}"
  local sql
  sql="$(sql_status)"
  if [[ -z "$sql" ]]; then
    warn "Cloud SQL instance '${DB_INSTANCE}' not found or not accessible."
  else
    log "cloudsql ${DB_INSTANCE}: ${sql}"
  fi

  run_services_array "$RUN_SERVICES"
  for service in "${SERVICES[@]}"; do
    local min_instances url
    min_instances="$(run_min_instances "$service")"
    url="$(gcloud run services describe "$service" \
      --region="$REGION" \
      --project="$PROJECT_ID" \
      --format='value(status.url)' 2>/dev/null || true)"
    if [[ -z "$url" ]]; then
      warn "Cloud Run service '${service}' not found or not accessible."
      continue
    fi
    log "cloudrun ${service}: min-instances=${min_instances} url=${url}"
  done
}

sleep_stack() {
  log "Sleeping stack in ${PROJECT_ID} (${REGION})"
  log "Setting Cloud SQL activation policy to NEVER..."
  gcloud sql instances patch "$DB_INSTANCE" \
    --project="$PROJECT_ID" \
    --activation-policy=NEVER \
    --quiet

  run_services_array "$RUN_SERVICES"
  for service in "${SERVICES[@]}"; do
    log "Setting Cloud Run min-instances=0 for ${service}..."
    gcloud run services update "$service" \
      --region="$REGION" \
      --project="$PROJECT_ID" \
      --min-instances=0 \
      --quiet
  done

  status
}

wake_stack() {
  log "Waking stack in ${PROJECT_ID} (${REGION})"
  log "Setting Cloud SQL activation policy to ALWAYS..."
  gcloud sql instances patch "$DB_INSTANCE" \
    --project="$PROJECT_ID" \
    --activation-policy=ALWAYS \
    --quiet

  run_services_array "$RUN_SERVICES"
  for service in "${SERVICES[@]}"; do
    log "Setting Cloud Run min-instances=${WAKE_MIN_INSTANCES} for ${service}..."
    gcloud run services update "$service" \
      --region="$REGION" \
      --project="$PROJECT_ID" \
      --min-instances="${WAKE_MIN_INSTANCES}" \
      --quiet
  done

  status
}

main() {
  need_cmd gcloud

  if [[ $# -ne 1 ]]; then
    printf 'Usage: %s [status|sleep|wake]\n' "$0" >&2
    exit 1
  fi

  case "$1" in
    status)
      status
      ;;
    sleep)
      sleep_stack
      ;;
    wake)
      wake_stack
      ;;
    *)
      printf 'Unknown action: %s\nUsage: %s [status|sleep|wake]\n' "$1" "$0" >&2
      exit 1
      ;;
  esac
}

main "$@"
