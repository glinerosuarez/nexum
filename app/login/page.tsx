import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Acceso al panel de control Nexum para constructoras.",
};

interface LoginPageProps {
  searchParams: Promise<{ redirect?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { redirect } = await searchParams;
  const redirectTo =
    redirect && redirect.startsWith("/") ? redirect : "/dashboard";

  return (
    <main className="grid min-h-screen lg:grid-cols-12">
      <section className="relative flex flex-col justify-between bg-ink px-6 py-10 text-canvas sm:px-12 lg:col-span-5 lg:py-12">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-[0.07] noise"
        />
        <div
          aria-hidden="true"
          className="absolute -right-24 -top-24 -z-10 h-72 w-72 rounded-full bg-accent/30 blur-3xl"
        />

        <Link
          href="/"
          className="inline-flex items-center gap-2.5 text-canvas"
          aria-label="Nexum"
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-canvas text-ink">
            <svg
              viewBox="0 0 20 20"
              className="h-3.5 w-3.5"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M3 16V4l14 12V4" />
            </svg>
          </span>
          <span className="font-display text-xl leading-none tracking-tight">
            Nexum
          </span>
        </Link>

        <div className="my-12 max-w-md lg:my-0">
          <span className="eyebrow mb-6 text-canvas/60">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            Panel de control
          </span>
          <h1 className="font-display text-display-md text-canvas">
            La obra, los costos y los insumos críticos en una sola vista.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-canvas/70">
            Ingresa para ver presupuesto vs. gasto en tiempo real, alertas de
            disponibilidad de insumos críticos y el avance del proyecto activo.
          </p>
        </div>

        <p className="text-xs text-canvas/40">
          © {new Date().getFullYear()} Nexum Project · Confidencial
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-10 lg:col-span-7">
        <div className="w-full max-w-md">
          <h2 className="font-display text-3xl text-ink">Iniciar sesión</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Acceso para directores, residentes de obra y residentes administrativos.
          </p>

          <div className="mt-8">
            <LoginForm redirectTo={redirectTo} />
          </div>

          <div className="mt-8 rounded-xl border border-dashed border-line bg-canvas-raised p-4 text-xs text-ink-muted">
            <p className="font-medium text-ink">Credenciales demo</p>
            <ul className="mt-2 space-y-1 font-mono text-[11px] leading-relaxed">
              <li>directora.proyecto@example.com · Password123!</li>
              <li>residente.obra@example.com · Password123!</li>
              <li>residente.admin@example.com · Password123!</li>
            </ul>
          </div>

          <p className="mt-8 text-xs text-ink-soft">
            ¿Aún no tienes cuenta? Solicítala a tu director PMO o{" "}
            <Link href="/" className="text-accent hover:underline">
              vuelve al inicio
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
