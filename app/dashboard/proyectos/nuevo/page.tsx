import { Topbar } from "@/components/dashboard/Topbar";
import { NewProjectWizard } from "@/components/dashboard/NewProjectWizard";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function NuevoProyectoPage() {
  const t = await getDictionary();
  return (
    <>
      <Topbar
        title={t.wizard.title}
        subtitle={t.wizard.subtitle}
      />
      <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
        <NewProjectWizard />
      </div>
    </>
  );
}
