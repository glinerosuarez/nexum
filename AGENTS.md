# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Nexum is a Next.js 16 (App Router) + TypeScript + Tailwind CSS platform running on GCP.

- **Landing page** (`/`) — static marketing surface
- **Dashboard** (`/dashboard/`) — authenticated app surface backed by `nexum-api`

### Runtime architecture

- Frontend: Cloud Run service `nexum-web`
- Backend API: Cloud Run service `nexum-api`
- Database: Cloud SQL PostgreSQL
- Auth: Firebase ID tokens

### Running the application

See `README.md` for standard commands (`npm run dev`, `npm run build`, etc.).

Local app runtime expects:

- `NEXUM_API_BASE_URL`
- Firebase settings from `.env.example` when auth flows are exercised

### Known issues

- **`npm run lint` may fail in this repo state**: `package.json` still maps lint to `next lint` while Next.js 16 favors ESLint CLI-based workflows. Use `npx eslint .` when needed.
- **No dedicated frontend test framework**: smoke + manual checks are still primary validation.
