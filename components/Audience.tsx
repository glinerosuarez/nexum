import { Container } from "./Container";
import { SectionHeader } from "./SectionHeader";

const segments = [
  {
    label: "Constructoras pyme",
    need: "Centralizar proyectos, clientes, documentos y reportes.",
    value: "Profesionalizar sin desplegar un ERP empresarial pesado.",
  },
  {
    label: "Directores de proyecto",
    need: "Controlar cronograma, costos, riesgos y decisiones de stakeholders.",
    value: "Una vista ejecutiva con recomendaciones de IA.",
  },
  {
    label: "Arquitectos y gerentes",
    need: "Clientes, propuestas, entregables y coordinación de diseño/obra.",
    value: "CRM + control de proyectos adaptado a construcción.",
  },
  {
    label: "Ingenieros residentes",
    need: "Seguir tareas, bloqueadores, compromisos y avances en campo.",
    value: "Claridad operativa y escalamiento más rápido.",
  },
  {
    label: "Consultores PMO",
    need: "Implementar gobernanza, tableros, controles y estándares.",
    value: "Un sistema reutilizable para múltiples portafolios.",
  },
  {
    label: "Infraestructura Caribe",
    need: "Acelerar transformación digital en un mercado de alta actividad.",
    value: "Producto SaaS regionalmente adaptado.",
  },
];

export function Audience() {
  return (
    <section id="audiencia" className="bg-canvas-sunken py-section">
      <Container size="wide">
        <SectionHeader
          eyebrow="Para quién"
          title="Hecho para los equipos que construyen Colombia."
          description="Nexum se ajusta a los flujos diarios de constructoras, equipos PMO y firmas de infraestructura — no al revés."
        />

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {segments.map((s) => (
            <article
              key={s.label}
              className="flex flex-col gap-3 bg-canvas-raised p-7 transition-colors hover:bg-white sm:p-8"
            >
              <h3 className="font-display text-xl text-ink">{s.label}</h3>
              <div className="hairline" />
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                    Necesidad
                  </dt>
                  <dd className="mt-1 text-ink">{s.need}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                    Valor
                  </dt>
                  <dd className="mt-1 text-ink-muted">{s.value}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
