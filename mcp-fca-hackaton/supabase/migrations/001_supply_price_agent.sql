-- P0: Supply price agent tables (matches deployed Supabase schema)
-- Safe to run on empty projects. If tables already exist with this layout, statements are skipped.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS supply_agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'running',
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error_summary TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supply_price_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supply_id UUID NOT NULL REFERENCES supply_catalog(id) ON DELETE CASCADE,
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    parse_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    priority INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_success_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supply_price_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    supply_id UUID NOT NULL REFERENCES supply_catalog(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES supply_price_sources(id) ON DELETE CASCADE,
    observed_at DATE NOT NULL,
    unit_price NUMERIC(18, 6) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supply_cost_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    supply_id UUID NOT NULL REFERENCES supply_catalog(id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES supply_agent_runs(id) ON DELETE CASCADE,
    forecast_date DATE NOT NULL,
    predicted_unit_price NUMERIC(18, 6) NOT NULL,
    model_version TEXT NOT NULL DEFAULT '1.0',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supply_cost_overrun_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES supply_agent_runs(id) ON DELETE CASCADE,
    severity TEXT NOT NULL,
    baseline_budget NUMERIC(18, 2) NOT NULL,
    projected_total_cost NUMERIC(18, 2) NOT NULL,
    overrun_amount NUMERIC(18, 2) NOT NULL,
    overrun_pct NUMERIC(10, 4) NOT NULL,
    threshold_pct NUMERIC(8, 4) NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supply_agent_runs_project_created
    ON supply_agent_runs (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_supply_price_sources_supply
    ON supply_price_sources (supply_id, is_active, priority);

CREATE INDEX IF NOT EXISTS idx_supply_price_observations_supply_date
    ON supply_price_observations (supply_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_supply_cost_forecasts_run_supply
    ON supply_cost_forecasts (run_id, supply_id, forecast_date);

CREATE INDEX IF NOT EXISTS idx_supply_cost_overrun_alerts_project
    ON supply_cost_overrun_alerts (project_id, status, created_at DESC);
