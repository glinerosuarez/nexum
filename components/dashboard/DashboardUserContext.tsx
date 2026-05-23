"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface DashboardUserMeta {
  name: string;
  email: string | null;
  role: string | null;
}

const Ctx = createContext<DashboardUserMeta | null>(null);

export function DashboardUserContext({
  value,
  children,
}: {
  value: DashboardUserMeta;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboardUser(): DashboardUserMeta {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return { name: "Usuario", email: null, role: null };
  }
  return ctx;
}
