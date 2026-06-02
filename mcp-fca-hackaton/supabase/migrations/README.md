# SQL migrations — Supply price agent

## P0

1. Tables must exist in the target PostgreSQL database. Reference schema: `001_supply_price_agent.sql`
2. Seed FRED sources:

```bash
uv run python scripts/seed_supply_price_sources.py
# or in pod:
kubectl exec deploy/mi-servidor-mcp -- env PYTHONPATH=/app python /app/scripts/seed_supply_price_sources.py
```

## Live column map

| Table | Key columns |
|-------|-------------|
| `supply_agent_runs` | `project_id`, `status`, `metadata` (counters, budget, options) |
| `supply_price_sources` | `supply_id`, `source_name`, `source_url`, `parse_config`, `is_active` |
| `supply_price_observations` | `project_id`, `supply_id`, `source_id`, `observed_at`, `unit_price` |
| `supply_cost_forecasts` | `run_id`, `supply_id`, `forecast_date`, `predicted_unit_price`, `metadata` |
| `supply_cost_overrun_alerts` | `baseline_budget`, `projected_total_cost`, `overrun_amount`, `overrun_pct`, `severity=critical` |

Optional: `DB_CONN=postgresql://... uv run python scripts/apply_supply_price_migration.py`
