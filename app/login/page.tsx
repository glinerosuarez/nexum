import Link from "next/link";
import { getDictionary } from "@/lib/i18n/server";
import { type Dictionary } from "@/lib/i18n/dictionaries/en";

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

function normalizeNextPath(value: string | undefined): string {
  if (!value) return "/dashboard/proyectos";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard/proyectos";
  return value;
}

function formatErrorMessage(raw: string | undefined, t: Dictionary): string | null {
  if (!raw) return null;
  const token = raw.toUpperCase();
  if (token.includes("INVALID_LOGIN_CREDENTIALS")) {
    return t.login.invalidCredentials;
  }
  if (token.includes("TOO_MANY_ATTEMPTS_TRY_LATER")) {
    return t.login.tooManyAttempts;
  }
  return t.login.defaultError;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = normalizeNextPath(params.next);
  const t = await getDictionary();
  const errorMessage = formatErrorMessage(params.error, t);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-10 sm:px-8">
      <div className="grid w-full gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-canvas-raised p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
            {t.login.panelAccess}
          </p>
          <h1 className="mt-3 font-display text-3xl text-ink">
            {t.login.title}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {t.login.subtitle}
          </p>

          {errorMessage ? (
            <p className="mt-4 rounded-xl border border-status-risk/30 bg-status-risk/10 px-3 py-2 text-sm text-status-risk">
              {errorMessage}
            </p>
          ) : null}

          <form action="/api/auth/login" method="post" className="mt-6 space-y-3">
            <input type="hidden" name="mode" value="password" />
            <input type="hidden" name="next" value={nextPath} />
            <label className="block text-sm text-ink-muted">
              {t.login.email}
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink outline-none ring-0 transition-colors focus:border-ink/35"
              />
            </label>
            <label className="block text-sm text-ink-muted">
              {t.login.password}
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink outline-none ring-0 transition-colors focus:border-ink/35"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-canvas transition-colors hover:bg-[#1a1a1c]"
            >
              {t.login.loginWithEmail}
            </button>
          </form>

          <div className="my-5 h-px bg-line" />

          <form action="/api/auth/login" method="post">
            <input type="hidden" name="mode" value="anonymous" />
            <input type="hidden" name="next" value={nextPath} />
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-full border border-line bg-canvas px-5 text-sm font-medium text-ink transition-colors hover:border-ink/35"
            >
              {t.login.loginAsGuest}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-line bg-canvas-raised p-6 sm:p-8">
          <h2 className="font-display text-2xl text-ink">{t.login.fastTrackTitle}</h2>
          <p className="mt-2 text-sm text-ink-muted">
            {t.login.fastTrackDesc}
          </p>
          <ul className="mt-4 space-y-2 text-sm text-ink-muted">
            <li>{t.login.step1}</li>
            <li>{t.login.step2}</li>
            <li>{t.login.step3(nextPath)}</li>
          </ul>
          <Link
            href="/"
            className="mt-6 inline-flex text-sm text-ink-muted transition-colors hover:text-ink"
          >
            {t.login.backToHome}
          </Link>
        </section>
      </div>
    </main>
  );
}
