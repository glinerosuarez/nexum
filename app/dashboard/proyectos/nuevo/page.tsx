import { Topbar } from "@/components/dashboard/Topbar";
import { NewProjectWizard } from "@/components/dashboard/NewProjectWizard";

export const dynamic = "force-dynamic";

export default function NuevoProyectoPage() {
  return (
    <>
      <Topbar
        title="Nuevo proyecto"
        subtitle="Carga un contrato y Nexum extrae nombre, fechas, presupuesto y fases."
      />
      <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
        <NewProjectWizard />
      </div>
    </>
  );
}
