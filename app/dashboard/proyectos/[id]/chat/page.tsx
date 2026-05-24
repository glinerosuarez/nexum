import { Topbar } from "@/components/dashboard/Topbar";
import { ProjectDataChat } from "@/components/dashboard/ProjectDataChat";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface ProjectChatPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectChatPage({ params }: ProjectChatPageProps) {
  const { id: projectId } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase
    .from("projects")
    .select("nombre")
    .eq("id", projectId)
    .maybeSingle();

  return (
    <>
      <Topbar
        title="Chat con tus datos"
        subtitle={`Proyecto: ${project?.nombre ?? "Sin nombre"}`}
      />
      <div className="space-y-6 px-5 py-8 sm:px-8">
        <ProjectDataChat projectId={projectId} />
      </div>
    </>
  );
}
