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

## Despliegue en Vercel (5 pasos)

1. Sube el repositorio a GitHub/GitLab/Bitbucket.
2. En [vercel.com/new](https://vercel.com/new) importa el repo.
3. Vercel detecta Next.js automáticamente. Deja los comandos por defecto (`next build`, output `Next.js`).
4. (Opcional) Agrega las variables de `.env.example` en *Project → Settings → Environment Variables*.
5. **Deploy**. Vercel publica en una URL `*.vercel.app` y entrega CDN, edge cache y optimización de imágenes/fuentes lista.

## Notas

- La página corre con `next/font` (cero requests a Google Fonts en runtime) y `next/image` listo para usarse al añadir fotografías.
- Todo el contenido es estático: el build genera HTML pre-renderizado, ideal para edge de Vercel.
