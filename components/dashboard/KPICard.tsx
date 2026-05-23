import type { LucideIcon } from "lucide-react";

interface KPICardProps {
  label: string;
  value: string;
  hint?: string;
  delta?: { value: string; tone: "ok" | "warn" | "risk" | "neutral" };
  icon?: LucideIcon;
  highlight?: boolean;
}

const deltaTone: Record<NonNullable<KPICardProps["delta"]>["tone"], string> = {
  ok: "bg-status-ok/10 text-status-ok",
  warn: "bg-status-warn/10 text-status-warn",
  risk: "bg-status-risk/10 text-status-risk",
  neutral: "bg-ink/5 text-ink-muted",
};

export function KPICard({ label, value, hint, delta, icon: Icon, highlight }: KPICardProps) {
  return (
    <article
      className={`rounded-2xl border p-5 transition-colors ${
        highlight
          ? "border-ink bg-ink text-canvas"
          : "border-line bg-canvas-raised text-ink hover:border-ink/20"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={`text-[11px] font-medium uppercase tracking-[0.14em] ${
            highlight ? "text-canvas/60" : "text-ink-soft"
          }`}
        >
          {label}
        </p>
        {Icon ? (
          <span
            aria-hidden="true"
            className={`grid h-8 w-8 place-items-center rounded-lg ${
              highlight
                ? "bg-canvas/10 text-canvas"
                : "bg-ink/5 text-ink-muted"
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </span>
        ) : null}
      </div>

      <p
        className={`mt-3 font-display text-3xl leading-tight ${
          highlight ? "text-canvas" : "text-ink"
        }`}
      >
        {value}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2">
        {hint ? (
          <p
            className={`text-xs ${
              highlight ? "text-canvas/60" : "text-ink-muted"
            }`}
          >
            {hint}
          </p>
        ) : (
          <span />
        )}
        {delta ? (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
              highlight ? "bg-canvas/10 text-canvas" : deltaTone[delta.tone]
            }`}
          >
            {delta.value}
          </span>
        ) : null}
      </div>
    </article>
  );
}
