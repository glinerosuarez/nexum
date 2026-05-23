import { Sidebar } from "@/components/dashboard/Sidebar";
import { ProjectsProvider } from "@/components/dashboard/ProjectContext";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, nombre")
    .order("created_at", { ascending: false });

  const choices = (projects ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
  }));

  return (
    <ProjectsProvider projects={choices}>
      <div className="flex min-h-screen bg-canvas">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </ProjectsProvider>
  );
}
