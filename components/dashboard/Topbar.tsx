"use client";

import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { useDashboardUser } from "./DashboardUserContext";

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const { name: userName, email: userEmail, role: userRole } = useDashboardUser();
  const initials = getInitials(userName);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-soft">
            Panel de control
          </p>
          <h1 className="font-display text-2xl text-ink sm:text-3xl">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-ink">{userName}</p>
            <p className="text-xs text-ink-soft">
              {userRole ?? userEmail ?? ""}
            </p>
          </div>
          <span
            aria-hidden="true"
            className="grid h-10 w-10 place-items-center rounded-full bg-ink font-mono text-xs uppercase text-canvas"
          >
            {initials}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Cerrar sesión"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-line bg-canvas-raised px-3 text-sm text-ink-muted transition-colors hover:border-ink/30 hover:text-ink"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "NX";
}
