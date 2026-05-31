# Nexum — Landing

Landing page production-ready para **Nexum**, plataforma PMO y ERP/CRM para construcción impulsada por IA. Construida con Next.js 15 (App Router), TypeScript y Tailwind CSS. Lista para desplegar en Vercel sin configuración adicional.

## Stack

- **Framework:** Next.js 15 (App Router) + React 19
- **Lenguaje:** TypeScript (strict)
- **Estilos:** Tailwind CSS 3.4
- **Tipografías:** `next/font` — Instrument Serif (display) + Inter (sans) + JetBrains Mono (mono)
- **Íconos:** `lucide-react`
- **Despliegue:** Vercel (sin servidor propio, sin Docker)

## Comandos

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # build de producción
npm run start    # servir el build
npm run lint
npm run smoke:migrated-flow
make gcp-cost-status
make gcp-sleep
make gcp-wake
```

## Estructura

```
app/
  layout.tsx          → fuentes, metadata SEO y OG
  page.tsx            → composición de la home
  globals.css         → variables, base y utilidades
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
tailwind.config.ts    → tokens de diseño (colores, fuentes, spacing)
next.config.ts        → configuración mínima para Vercel
postcss.config.mjs
.env.example          → variables documentadas
```

## Sistema de diseño

Estilo minimalista, premium y técnico:

- **Paleta:** canvas crema `#F7F6F2`, ink `#0B0B0C`, acento ámbar `#B45309`, estados `ok / warn / risk`.
- **Tipografía:** display serif (Instrument Serif) + cuerpo sans (Inter) + mono (JetBrains Mono).
- **Layout:** mobile-first; breakpoints `sm / md / lg / xl`; container centrado con padding responsivo.
- **Componentes:** botón pill, cards con borde hairline, tabla "grid de hairlines", chat IA, hero KPI mock.

## Variables de entorno

Ver `.env.example`. Ninguna variable es obligatoria para que el sitio compile; solo se documentan para el correo de contacto y analítica opcional.

### Chat con datos (LLM barato)

El chat de proyecto soporta endpoint OpenAI y endpoint OpenAI-compatible en Google Cloud.

Config por defecto (OpenAI):

```bash
OPENAI_MODEL=gpt-4.1-nano
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_PATH=/responses
OPENAI_USE_CHAT_COMPLETIONS=false
```

Config en Google Cloud Vertex AI (OpenAI-compatible):

```bash
OPENAI_MODEL=google/gemini-2.5-flash-lite
OPENAI_API_KEY=<bearer-token>
OPENAI_BASE_URL=https://aiplatform.googleapis.com/v1/projects/<PROJECT_ID>/locations/global/endpoints/openapi
OPENAI_API_PATH=/chat/completions
OPENAI_USE_CHAT_COMPLETIONS=true
```

### Block 1: API backend en Cloud Run

El frontend ya no invoca Edge Functions de Supabase para los flujos migrados.
Ahora consume `nexum-api`:

- `POST /projects` (creación + bootstrap de onboarding)
- `POST /agent/run-supply-cost`
- `GET /chat/messages`
- `POST /chat/messages`
- `GET /dashboard/summary`
- `GET /projects/:id/*`

Variables mínimas en runtime web:

```bash
NEXUM_API_BASE_URL=https://<nexum-api-service>.run.app
FIREBASE_PROJECT_ID=<firebase-project-id>
```

El token Firebase debe enviarse como `Authorization: Bearer <token>` o cookie `firebase_id_token`.

### Login UI (Firebase)

El web ya incluye flujo de autenticación por UI:

- `GET /login`: formulario de correo/clave + acceso invitado (anónimo).
- `POST /api/auth/login`: valida con Firebase Auth y guarda cookie `firebase_id_token` (HttpOnly).
- `POST /api/auth/logout`: limpia cookie y redirige a login.

Flujo recomendado para demo:

1. Abrir `/login?next=/dashboard/proyectos`.
2. Click en **Entrar como invitado**.
3. Se redirige al dashboard autenticado.

### Smoke del flujo migrado

Con `nexum-web` y `nexum-api` activos, ejecuta:

```bash
NEXT_BASE_URL=http://localhost:3000 \
NEXUM_API_BASE_URL=https://<nexum-api-service>.run.app \
FIREBASE_ID_TOKEN=<firebase-id-token> \
npm run smoke:migrated-flow
```

Valida: crear proyecto (`POST /projects`) -> correr agente proxy -> consultar dashboard summary -> renderizar dashboard del proyecto.

### Ahorro de costos GCP (sleep/wake)

Para entorno demo idle:

- `make gcp-sleep`: detiene Cloud SQL (`activationPolicy=NEVER`) y fuerza `min-instances=0` en Cloud Run.
- `make gcp-wake`: re-activa Cloud SQL (`activationPolicy=ALWAYS`) y restaura `min-instances` de Cloud Run (default `0`; configurable).
- `make gcp-cost-status`: muestra estado actual de SQL y Cloud Run.

Variables sobrescribibles:

```bash
make gcp-sleep PROJECT_ID=nexum-497302 REGION=us-central1 DB_INSTANCE=nexum-postgres
make gcp-wake RUN_SERVICES="nexum-api nexum-web supply-agent-mcp" WAKE_MIN_INSTANCES=1
```

Notas:

- El ahorro fuerte viene de pausar Cloud SQL.
- Cloud Run con `min-instances=0` ya "duerme" solo; dejar `WAKE_MIN_INSTANCES=0` minimiza costo y acepta cold starts.
- Artifact Registry y Cloud Storage no se "pausan"; si necesitas más ahorro ahí, usa políticas de lifecycle/retención para limpieza.

## Despliegue en Vercel (5 pasos)

1. Sube el repositorio a GitHub/GitLab/Bitbucket.
2. En [vercel.com/new](https://vercel.com/new) importa el repo.
3. Vercel detecta Next.js automáticamente. Deja los comandos por defecto (`next build`, output `Next.js`).
4. (Opcional) Agrega las variables de `.env.example` en *Project → Settings → Environment Variables*.
5. **Deploy**. Vercel publica en una URL `*.vercel.app` y entrega CDN, edge cache y optimización de imágenes/fuentes lista.

## Notas

- La página corre con `next/font` (cero requests a Google Fonts en runtime) y `next/image` listo para usarse al añadir fotografías.
- Todo el contenido es estático: el build genera HTML pre-renderizado, ideal para edge de Vercel.
