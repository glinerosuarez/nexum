import { Topbar } from "@/components/dashboard/Topbar";
import { AgentRunFlow } from "@/components/dashboard/AgentRunFlow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface AgentRunPageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentRunPage({ params }: AgentRunPageProps) {
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
        title={project?.nombre ?? "Proyecto"}
        subtitle="Ejecuta el agente de insumos críticos para calcular forecast y riesgo de costos."
      />
      <div className="space-y-6 px-5 py-8 sm:px-8">
        <div
          role="status"
          className="rounded-2xl border border-status-ok/30 bg-status-ok/5 px-4 py-3 text-sm text-status-ok"
        >
          Proyecto creado correctamente.
        </div>
        <AgentRunFlow projectId={projectId} />
      </div>
    </>
  );
}
