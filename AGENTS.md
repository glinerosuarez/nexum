# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Nexum is a Next.js 16 (App Router) + TypeScript + Tailwind CSS construction project management platform backed by Supabase (PostgreSQL). It has two main surfaces:

- **Landing page** (`/`) — static, no database required
- **Dashboard** (`/dashboard/`) — data-driven, requires Supabase

### Running the application

See `README.md` for standard commands (`npm run dev`, `npm run build`, etc.).

The dev server runs on port 3000.

### Supabase (local)

The dashboard requires a running Supabase instance. To start locally:

```bash
sudo dockerd &>/tmp/dockerd.log &
sleep 5
sudo chmod 666 /var/run/docker.sock
npx supabase start
```

After `supabase start`, the output displays the API URL and anon key. The `.env.local` should contain:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase status>
```

Migrations in `supabase/migrations/` are applied automatically on `supabase start` and include seed data (demo project "Edificio Nexum Central" with phases, activities, supplies, etc.).

### Known issues

- **`npm run lint` is broken**: The `package.json` script uses `next lint`, which was removed in Next.js 16. Run `npx eslint .` directly instead (requires `eslint.config.mjs` at the repo root). Additionally, `eslint-plugin-react@7.37.5` bundled by `eslint-config-next` is incompatible with ESLint 10 (`contextOrFilename.getFilename is not a function`). TypeScript checking works fine through `npm run build`.
- **No test framework**: The repo has no automated tests or test infrastructure.

### Docker in Cloud Agent VMs

Docker requires special setup in the nested container environment:

1. Install `fuse-overlayfs` and configure `/etc/docker/daemon.json` with `"storage-driver": "fuse-overlayfs"`
2. Switch to `iptables-legacy` via `update-alternatives`
3. Start `dockerd` manually (no systemd)

These steps are already handled by the environment setup.

### Environment variables

Only two env vars are required for the dashboard (see `.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Both are generated locally by `npx supabase start` — no external secrets needed for local development.
