import { Topbar } from "@/components/dashboard/Topbar";
import { AgentRunFlow } from "@/components/dashboard/AgentRunFlow";
import { getProjectBasic, getSupplySelectionInputs } from "@/lib/dashboard-data";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface AgentRunPageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentRunPage({ params }: AgentRunPageProps) {
  const { id: projectId } = await params;
  const t = await getDictionary(projectId);
  const [project, selectionInputs] = await Promise.all([
    getProjectBasic(projectId),
    getSupplySelectionInputs(projectId).catch(() => null),
  ]);
  const normalizedSupplyCount =
    selectionInputs?.row_counts?.normalized_supply_count
    ?? selectionInputs?.normalized_supplies?.length
    ?? 0;

  return (
    <>
      <Topbar
        title={project?.nombre ?? t.sidebar.noProjectActive}
        subtitle={t.agent.topbarSubtitle}
      />
      <div className="space-y-6 px-5 py-8 sm:px-8">
        <div
          role="status"
          className="rounded-2xl border border-status-ok/30 bg-status-ok/5 px-4 py-3 text-sm text-status-ok"
        >
          {t.proyectos.createdOk}
        </div>
        <AgentRunFlow
          projectId={projectId}
          shouldAutoRun={normalizedSupplyCount > 0}
          normalizedSupplyCount={normalizedSupplyCount}
        />
      </div>
    </>
  );
}
