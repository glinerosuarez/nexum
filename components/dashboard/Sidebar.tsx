"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderKanban,
  LayoutDashboard,
  MessageSquare,
  PackageSearch,
  Plus,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useProjects } from "./ProjectContext";

import { useTranslation } from "@/lib/i18n/client";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export function Sidebar() {
  const pathname = usePathname();
  const projects = useProjects();
  const t = useTranslation();

  const projectMatch = pathname.match(
    /^\/dashboard\/proyectos\/([0-9a-fA-F-]{36})(?:\/.*)?$/,
  );
  const currentProjectId = projectMatch?.[1] ?? null;
  const currentProject = currentProjectId
    ? (projects.find((p) => p.id === currentProjectId) ?? null)
    : null;

  const carteraItems: NavItem[] = [
    {
      href: "/dashboard/proyectos",
      label: t.sidebar.projects,
      icon: FolderKanban,
      description: t.sidebar.projectsInPortfolio(projects.length),
    },
  ];

  const projectItems: NavItem[] = currentProjectId
    ? [
        {
          href: `/dashboard/proyectos/${currentProjectId}`,
          label: t.sidebar.executiveView,
          icon: LayoutDashboard,
          description: t.sidebar.kpisAndAlerts,
        },
        {
          href: `/dashboard/proyectos/${currentProjectId}/insumos`,
          label: t.sidebar.criticalSupplies,
          icon: PackageSearch,
          description: t.sidebar.catalogAndAvailability,
        },
        {
          href: `/dashboard/proyectos/${currentProjectId}/costos`,
          label: t.sidebar.costs,
          icon: Wallet,
          description: t.sidebar.budgetAndSpend,
        },
        {
          href: `/dashboard/proyectos/${currentProjectId}/chat`,
          label: t.sidebar.chat,
          icon: MessageSquare,
          description: t.sidebar.queryYourData,
        },
      ]
    : [];

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

      <div className="flex flex-1 flex-col overflow-y-auto">
        <section className="p-3">
          <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
            {t.sidebar.portfolio}
          </p>
          <ul className="space-y-1">
            {carteraItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(pathname, item.href, true)}
              />
            ))}
            <li>
              <Link
                href="/dashboard/proyectos/nuevo"
                className={`flex items-center gap-2 rounded-xl border border-dashed border-line bg-canvas px-3 py-2 text-sm text-ink-muted transition-colors hover:border-ink/30 hover:text-ink ${
                  pathname === "/dashboard/proyectos/nuevo"
                    ? "border-ink/30 text-ink"
                    : ""
                }`}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t.sidebar.newProject}
              </Link>
            </li>
          </ul>
        </section>

        {currentProjectId ? (
          <section className="border-t border-line p-3">
            <div className="mb-2 flex items-start justify-between gap-2 px-2 pt-1">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
                  {t.sidebar.projectScope}
                </p>
                <p
                  className="mt-1 truncate text-[13px] font-medium leading-tight text-ink"
                  title={currentProject?.nombre ?? t.sidebar.noProjectActive}
                >
                  {currentProject?.nombre ?? t.sidebar.noProjectActive}
                </p>
              </div>
              <Link
                href="/dashboard/proyectos"
                aria-label="Salir del proyecto"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
            <ul className="mt-2 space-y-1">
              {projectItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href, item.label === "Vista ejecutiva")}
                />
              ))}
            </ul>
          </section>
        ) : (
          <section className="border-t border-line p-3">
            <div className="rounded-xl border border-dashed border-line bg-canvas p-3 text-xs text-ink-soft">
              {t.sidebar.selectProjectHint}
            </div>
          </section>
        )}

        <div className="mt-auto border-t border-line p-4 text-[11px] text-ink-soft">
          {t.sidebar.hackathonFooter}
        </div>
      </div>
    </aside>
  );
}

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
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
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-medium leading-tight">
            {item.label}
          </span>
          <span
            className={`truncate text-[11px] ${
              active ? "text-canvas/60" : "text-ink-soft"
            }`}
          >
            {item.description}
          </span>
        </span>
      </Link>
    </li>
  );
}
