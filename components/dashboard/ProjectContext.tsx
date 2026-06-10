"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface ProjectChoice {
  id: string;
  nombre: string;
  idioma: string;
}

const ProjectsCtx = createContext<ProjectChoice[]>([]);

export function ProjectsProvider({
  projects,
  children,
}: {
  projects: ProjectChoice[];
  children: ReactNode;
}) {
  return (
    <ProjectsCtx.Provider value={projects}>{children}</ProjectsCtx.Provider>
  );
}

export function useProjects(): ProjectChoice[] {
  return useContext(ProjectsCtx);
}
