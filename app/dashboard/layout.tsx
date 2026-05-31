import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { ProjectsProvider } from "@/components/dashboard/ProjectContext";
import { listProjects } from "@/lib/dashboard-data";
import { isFirebaseAuthError } from "@/lib/nexum-api/client";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let projects: Awaited<ReturnType<typeof listProjects>> = [];
  let shouldRedirectToHome = false;

  try {
    projects = await listProjects();
  } catch (error) {
    if (isFirebaseAuthError(error)) {
      shouldRedirectToHome = true;
    } else {
      throw error;
    }
  }

  if (shouldRedirectToHome) {
    redirect("/login?next=/dashboard/proyectos");
  }

  const choices = projects.map((p) => ({
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
