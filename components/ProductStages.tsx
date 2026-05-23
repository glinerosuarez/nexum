import { Container } from "./Container";
import { SectionHeader } from "./SectionHeader";

const stages = [
  {
    n: "01",
    title: "Configura el espacio PMO de la empresa",
    body: "Crea empresa, portafolio, proyectos, clientes, contratos y roles. Mapea cada proyecto a dominios PMI, tableros ágiles, documentos y oportunidades.",
    deliverables: ["Espacio de trabajo", "Portafolio", "Roles", "Datos base"],
  },
  {
    n: "02",
    title: "Monitorea el control con inteligencia PMO",
    body: "SPI, CPI, riesgos tipo semáforo, tareas vencidas, bloqueadores y aprobaciones pendientes. Acciones priorizadas para el director cada día.",
    deliverables: ["Tablero ejecutivo", "Tarjetas de riesgo", "Lista diaria"],
  },
  {
    n: "03",
    title: "Ejecuta con rutinas ágiles de construcción",
    body: "Hitos convertidos en paquetes de trabajo y tareas Kanban. Lookahead semanal, bloqueadores con responsable y resúmenes automáticos de reunión.",
    deliverables: ["Kanban", "Lookahead", "Bloqueadores", "Actas"],
  },
  {
    n: "04",
    title: "Gestiona pipeline comercial y documentos",
    body: "Leads, oportunidades, propuestas, contratos, pólizas y versiones en un solo lugar. Alertas de vencimiento y aprobaciones pendientes.",
    deliverables: ["Pipeline CRM", "Ficha cliente", "Repositorio", "Alertas"],
  },
  {
    n: "05",
    title: "Reporta y decide con el copiloto de IA",
    body: "Resúmenes de proyecto, explicaciones de riesgo, planes de acción, actualizaciones para cliente y reportes ejecutivos generados en segundos.",
    deliverables: ["Chat IA", "Reportes", "Plan de acción", "Updates cliente"],
  },
];

export function ProductStages() {
  return (
    <section id="producto" className="bg-canvas-sunken py-section">
      <Container size="wide">
        <SectionHeader
          eyebrow="Cómo funciona"
          title={
            <>
              Cinco etapas conectadas, del espacio de trabajo a la decisión
              ejecutiva.
            </>
          }
          description="Un flujo end-to-end que aprende tu portafolio, hace visibles los riesgos, ayuda al equipo a actuar y produce salidas listas para presentar."
        />

        <ol className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
          {stages.map((s) => (
            <li
              key={s.n}
              className="grid gap-6 bg-canvas-raised p-7 transition-colors hover:bg-white sm:p-8 lg:grid-cols-12 lg:items-start lg:gap-10"
            >
              <div className="flex items-baseline gap-4 lg:col-span-3">
                <span className="font-mono text-sm text-ink-soft">{s.n}</span>
                <span className="hairline flex-1 translate-y-1.5 lg:block hidden" />
              </div>
              <div className="lg:col-span-6">
                <h3 className="font-display text-2xl text-ink sm:text-3xl">
                  {s.title}
                </h3>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-muted">
                  {s.body}
                </p>
              </div>
              <ul className="flex flex-wrap gap-2 lg:col-span-3 lg:justify-end">
                {s.deliverables.map((d) => (
                  <li
                    key={d}
                    className="rounded-full border border-line bg-canvas px-3 py-1 text-xs text-ink"
                  >
                    {d}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
