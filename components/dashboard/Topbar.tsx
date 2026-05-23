import Link from "next/link";
import { Home } from "lucide-react";

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export function Topbar({ title, subtitle }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-soft">
            Panel de control
          </p>
          <h1 className="truncate font-display text-2xl text-ink sm:text-3xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
          ) : null}
        </div>

        <Link
          href="/"
          aria-label="Volver al inicio"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-line bg-canvas-raised px-3 text-sm text-ink-muted transition-colors hover:border-ink/30 hover:text-ink"
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Inicio</span>
        </Link>
      </div>
    </header>
  );
}
