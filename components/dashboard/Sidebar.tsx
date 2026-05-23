"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PackageSearch,
  Upload,
  Wallet,
  type LucideIcon,
} from "lucide-react";

const items: { href: string; label: string; icon: LucideIcon; description: string }[] = [
  {
    href: "/dashboard",
    label: "Vista ejecutiva",
    icon: LayoutDashboard,
    description: "KPIs y alertas",
  },
  {
    href: "/dashboard/insumos",
    label: "Insumos críticos",
    icon: PackageSearch,
    description: "Catálogo y disponibilidad",
  },
  {
    href: "/dashboard/insumos/precios",
    label: "Carga de precios",
    icon: Upload,
    description: "ETL y monitoreo",
  },
  {
    href: "/dashboard/costos",
    label: "Costos",
    icon: Wallet,
    description: "Presupuesto y gasto",
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Navegación del panel"
      className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-canvas-raised lg:flex"
    >
      <Link
        href="/"
        className="flex items-center gap-2.5 border-b border-line px-6 py-5"
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

      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                active
                  ? "bg-ink text-canvas"
                  : "text-ink-muted hover:bg-ink/5 hover:text-ink"
              }`}
            >
              <span
                className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${
                  active
                    ? "border-canvas/15 bg-canvas/10 text-canvas"
                    : "border-line bg-canvas text-ink"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-medium leading-tight">
                  {item.label}
                </span>
                <span
                  className={`text-[11px] ${
                    active ? "text-canvas/60" : "text-ink-soft"
                  }`}
                >
                  {item.description}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line p-4 text-[11px] text-ink-soft">
        Prototipo de hackathon v2.0
      </div>
    </aside>
  );
}
