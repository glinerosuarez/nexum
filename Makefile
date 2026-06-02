SHELL := /bin/bash

PROJECT_ID ?= nexum-497302
REGION ?= us-central1
DB_INSTANCE ?= nexum-postgres
RUN_SERVICES ?= nexum-api nexum-web mcp-fca-hackaton
WAKE_MIN_INSTANCES ?= 0

COST_SCRIPT := ./scripts/gcp-cost-controls.sh

.PHONY: gcp-cost-status gcp-sleep gcp-wake

gcp-cost-status:
	@PROJECT_ID="$(PROJECT_ID)" \
	REGION="$(REGION)" \
	DB_INSTANCE="$(DB_INSTANCE)" \
	RUN_SERVICES="$(RUN_SERVICES)" \
	WAKE_MIN_INSTANCES="$(WAKE_MIN_INSTANCES)" \
	"$(COST_SCRIPT)" status

gcp-sleep:
	@PROJECT_ID="$(PROJECT_ID)" \
	REGION="$(REGION)" \
	DB_INSTANCE="$(DB_INSTANCE)" \
	RUN_SERVICES="$(RUN_SERVICES)" \
	WAKE_MIN_INSTANCES="$(WAKE_MIN_INSTANCES)" \
	"$(COST_SCRIPT)" sleep

gcp-wake:
	@PROJECT_ID="$(PROJECT_ID)" \
	REGION="$(REGION)" \
	DB_INSTANCE="$(DB_INSTANCE)" \
	RUN_SERVICES="$(RUN_SERVICES)" \
	WAKE_MIN_INSTANCES="$(WAKE_MIN_INSTANCES)" \
	"$(COST_SCRIPT)" wake
