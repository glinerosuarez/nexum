# Cloud SQL migration SQL assets

1. Apply `000_cloudsql_baseline.sql` (translated from `supabase/migrations/*` with Supabase-only auth/RLS removed).
2. Apply `001_profiles_external_auth.sql` to switch identity linkage to Firebase UID.
3. Load seed/demo data.
4. Run parity checks from:

```bash
SOURCE_DB_CONN='<supabase-postgres-conn>' \
TARGET_DB_CONN='<cloudsql-postgres-conn>' \
python ../../../../MCP_FCA_HACKATON/scripts/migration/verify_migration_parity.py
```

Or, if direct Supabase Postgres credentials are unavailable, run in REST mode:

```bash
SOURCE_SUPABASE_URL='https://<project-ref>.supabase.co' \
SOURCE_SUPABASE_ANON_KEY='<anon-key>' \
TARGET_DB_CONN='<cloudsql-postgres-conn>' \
python ../../../../MCP_FCA_HACKATON/scripts/migration/verify_migration_parity.py
```

This patch intentionally removes dependency on `auth.users` trigger assumptions and shifts profile bootstrap to app/API logic.
