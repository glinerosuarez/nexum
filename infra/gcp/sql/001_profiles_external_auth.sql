-- Cloud SQL baseline patch for Firebase-authenticated identities.
-- Removes dependency on Supabase-managed auth.users linkage.

alter table if exists profiles
  add column if not exists external_auth_id text;

drop index if exists idx_profiles_external_auth_id;

create unique index if not exists idx_profiles_external_auth_id
  on profiles (external_auth_id);

-- Optional backfill path for existing demo profile entries.
-- Update this statement for your imported users before enabling auth-required mode.
-- update profiles set external_auth_id = '<firebase-uid>' where email = '<demo-email>';
