# Nexum — Landing

Production-ready landing page for **Nexum**, an AI-powered PMO and ERP/CRM platform for construction. Built with Next.js 15 (App Router), TypeScript, and Tailwind CSS. Migrated to run on Cloud Run with a GCP backend API.

## Stack

- **Framework:** Next.js 15 (App Router) + React 19
- **Language:** TypeScript (strict)
- **Styling:** Tailwind CSS 3.4
- **Typography:** `next/font` — Instrument Serif (display) + Inter (sans) + JetBrains Mono (mono)
- **Icons:** `lucide-react`
- **Deployment:** Cloud Run (Docker container)

## Commands

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run start    # serve the build
npm run lint
npm run smoke:migrated-flow
make gcp-cost-status
make gcp-sleep
make gcp-wake
```

## Structure

```
app/
  layout.tsx          → fonts, SEO/OG metadata
  page.tsx            → home page composition
  globals.css         → variables, base, and utilities
components/
  Navigation.tsx
  Hero.tsx
  ProblemStats.tsx
  SolutionLayers.tsx
  Methodology.tsx
  ProductStages.tsx
  AICopilotShowcase.tsx
  Audience.tsx
  CTASection.tsx
  Footer.tsx
  Container.tsx
  Button.tsx
  SectionHeader.tsx
public/
  favicon.svg
  og-image.svg
tailwind.config.ts    → design tokens (colors, fonts, spacing)
next.config.ts        → minimal Next.js configuration
postcss.config.mjs
.env.example          → documented environment variables
```

## Design System

Minimal, premium, and technical style:

- **Palette:** cream canvas `#F7F6F2`, ink `#0B0B0C`, amber accent `#B45309`, status colors `ok / warn / risk`.
- **Typography:** display serif (Instrument Serif) + body sans (Inter) + mono (JetBrains Mono).
- **Layout:** mobile-first; breakpoints `sm / md / lg / xl`; centered container with responsive padding.
- **Components:** pill button, hairline-border cards, hairline-grid table, AI chat, KPI hero mock.

## Environment Variables

See `.env.example`. No variable is strictly required to compile the site; variables are documented mainly for contact email and optional analytics.

### Data Chat (Low-Cost LLM)

The project chat supports both OpenAI and OpenAI-compatible endpoints on Google Cloud.

Default configuration (OpenAI):

```bash
OPENAI_MODEL=gpt-4.1-nano
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_PATH=/responses
OPENAI_USE_CHAT_COMPLETIONS=false
```

Google Cloud Vertex AI configuration (OpenAI-compatible):

```bash
OPENAI_MODEL=google/gemini-2.5-flash-lite
OPENAI_API_KEY=<bearer-token>
OPENAI_BASE_URL=https://aiplatform.googleapis.com/v1/projects/<PROJECT_ID>/locations/global/endpoints/openapi
OPENAI_API_PATH=/chat/completions
OPENAI_USE_CHAT_COMPLETIONS=true
```

### Block 1: Cloud Run API Backend

The frontend no longer calls Supabase Edge Functions for migrated flows.
It now consumes `nexum-api`:

- `POST /projects` (project creation + onboarding bootstrap)
- `POST /agent/run-supply-cost`
- `GET /chat/messages`
- `POST /chat/messages`
- `GET /dashboard/summary`
- `GET /projects/:id/*`

Minimum web runtime variables:

```bash
NEXUM_API_BASE_URL=https://<nexum-api-service>.run.app
FIREBASE_PROJECT_ID=<firebase-project-id>
```

Firebase token must be sent as `Authorization: Bearer <token>` or `firebase_id_token` cookie.

### Login UI (Firebase)

The web app already includes UI authentication flow:

- `GET /login`: email/password form + guest (anonymous) access.
- `POST /api/auth/login`: validates with Firebase Auth and stores `firebase_id_token` cookie (HttpOnly).
- `POST /api/auth/logout`: clears cookie and redirects to login.

Recommended demo flow:

1. Open `/login?next=/dashboard/proyectos`.
2. Click **Entrar como invitado**.
3. User is redirected to the authenticated dashboard.

### Migrated Flow Smoke Test

With `nexum-web` and `nexum-api` running, execute:

```bash
NEXT_BASE_URL=http://localhost:3000 \
NEXUM_API_BASE_URL=https://<nexum-api-service>.run.app \
FIREBASE_ID_TOKEN=<firebase-id-token> \
npm run smoke:migrated-flow
```

Validation path: create project (`POST /projects`) -> run agent proxy -> fetch dashboard summary -> render project dashboard.

### GCP Cost Savings (Sleep/Wake)

For idle demo environments:

- `make gcp-sleep`: stops Cloud SQL (`activationPolicy=NEVER`) and forces `min-instances=0` on Cloud Run.
- `make gcp-wake`: re-enables Cloud SQL (`activationPolicy=ALWAYS`) and restores Cloud Run `min-instances` (default `0`; configurable).
- `make gcp-cost-status`: prints current SQL + Cloud Run status.

Overridable variables:

```bash
make gcp-sleep PROJECT_ID=nexum-497302 REGION=us-central1 DB_INSTANCE=nexum-postgres
make gcp-wake RUN_SERVICES="nexum-api nexum-web supply-agent-mcp" WAKE_MIN_INSTANCES=1
```

Notes:

- Most savings come from pausing Cloud SQL.
- Cloud Run with `min-instances=0` already auto-sleeps; keeping `WAKE_MIN_INSTANCES=0` minimizes cost and accepts cold starts.
- Artifact Registry and Cloud Storage cannot be paused; for extra savings there, use lifecycle/retention policies for cleanup.

## Cloud Run Deployment (Manual)

1. Build and publish image:
```bash
gcloud builds submit . \
  --project=nexum-497302 \
  --tag=us-central1-docker.pkg.dev/nexum-497302/nexum/nexum-web:<tag>
```
2. Deploy `nexum-web`:
```bash
gcloud run deploy nexum-web \
  --project=nexum-497302 \
  --region=us-central1 \
  --image=us-central1-docker.pkg.dev/nexum-497302/nexum/nexum-web:<tag> \
  --allow-unauthenticated \
  --port=8080 \
  --set-env-vars=NEXUM_API_BASE_URL=https://nexum-api-xxxxx-uc.a.run.app \
  --set-secrets=FIREBASE_WEB_API_KEY=nexum-firebase-web-api-key:latest
```
3. Verify service URL:
```bash
gcloud run services describe nexum-web \
  --project=nexum-497302 \
  --region=us-central1 \
  --format='value(status.url)'
```

## Notes

- The page uses `next/font` (zero runtime requests to Google Fonts), and `next/image` is ready when adding photography.
- For authenticated flows, `nexum-web` depends on `nexum-api` and configured Firebase Auth.
