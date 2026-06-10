"use client";

import { usePathname } from "next/navigation";
import { useProjects } from "@/components/dashboard/ProjectContext";
import { en } from "./dictionaries/en";
import { es } from "./dictionaries/es";

export function useTranslation() {
  const pathname = usePathname();
  const projects = useProjects();
  
  const match = pathname.match(/^\/dashboard\/proyectos\/([0-9a-fA-F-]{36})/);
  const currentProjectId = match?.[1] ?? null;
  const currentProject = currentProjectId 
    ? projects.find((p) => p.id === currentProjectId) 
    : null;
    
  const lang = currentProject?.idioma || 'en';
  return lang === 'es' ? es : en;
}
