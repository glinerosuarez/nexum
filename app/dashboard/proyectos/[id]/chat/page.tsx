import { Topbar } from "@/components/dashboard/Topbar";
import { ProjectDataChat } from "@/components/dashboard/ProjectDataChat";
import { getProjectBasic } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

interface ProjectChatPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectChatPage({ params }: ProjectChatPageProps) {
  const { id: projectId } = await params;

  const project = await getProjectBasic(projectId);

  return (
    <>
      <Topbar
        title="Chat with your data"
        subtitle={`Project: ${project?.nombre ?? "Untitled"}`}
      />
      <div className="space-y-6 px-5 py-8 sm:px-8">
        <ProjectDataChat projectId={projectId} />
      </div>
    </>
  );
}
