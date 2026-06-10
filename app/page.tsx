import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-static";

export default async function Home() {
  const t = await getDictionary();

  return (
    <main className="relative flex min-h-screen flex-col">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-[520px] grid-bg opacity-60 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,black,transparent_70%)]"
      />

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6 sm:px-8">
        <Link
          href="/"
          aria-label="Nexum — ir al inicio"
          className="flex items-center gap-2.5"
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-ink text-canvas">
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
        <Link
          href="/login?next=/dashboard/proyectos"
          className="text-sm text-ink-muted transition-colors hover:text-ink"
        >
          {t.landing.loginArrow}
        </Link>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-16 text-center sm:px-8">
        <span className="eyebrow mb-7">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          {t.landing.eyebrow}
        </span>

        <h1 className="font-display text-display-xl text-ink">
          Nexum
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted sm:text-xl">
          {t.landing.description.split(t.landing.costs)[0]}
          <span className="text-ink">{t.landing.costs}</span>
          {t.landing.description.split(t.landing.costs)[1].split(t.landing.supplyCriticality)[0]}
          <span className="text-ink">{t.landing.supplyCriticality}</span>
          {t.landing.description.split(t.landing.supplyCriticality)[1]}
        </p>

        <Link
          href="/login?next=/dashboard/proyectos"
          className="mt-10 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-7 text-[15px] font-medium text-canvas transition-colors hover:bg-[#1a1a1c]"
        >
          {t.landing.login}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>

      <footer className="mx-auto w-full max-w-5xl border-t border-line px-6 py-6 text-center text-xs text-ink-soft sm:px-8">
        {t.landing.footer(new Date().getFullYear())}
      </footer>
    </main>
  );
}
