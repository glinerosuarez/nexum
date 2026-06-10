import { getProjectBasic } from "@/lib/dashboard-data";
import { en } from "./dictionaries/en";
import { es } from "./dictionaries/es";

export async function getDictionary(projectId?: string) {
  if (!projectId) return en;
  const project = await getProjectBasic(projectId);
  const lang = project?.idioma || 'en';
  return lang === 'es' ? es : en;
}
