import {
  BarChart3,
  KanbanSquare,
  Handshake,
  FolderLock,
  MessagesSquare,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Container } from "./Container";
import { SectionHeader } from "./SectionHeader";

interface Layer {
  icon: LucideIcon;
  title: string;
  capability: string;
  features: string[];
}

const layers: Layer[] = [
  {
    icon: BarChart3,
    title: "Inteligencia PMO",
    capability: "Portafolio, cronograma, costos, riesgos y KPIs.",
    features: [
      "Tablero ejecutivo",
      "Tarjetas de riesgo",
      "Indicadores SPI / CPI",
      "Plan diario de acción",
    ],
  },
  {
    icon: KanbanSquare,
    title: "Ejecución Ágil",
    capability: "Coordinación de obra con planificación adaptativa.",
    features: [
      "Kanban por proyecto",
      "Compromisos semanales",
      "Registro de bloqueadores",
      "Lookahead Last Planner",
    ],
  },
  {
    icon: Handshake,
    title: "CRM Comercial",
    capability: "Pipeline para oportunidades de construcción de ciclo largo.",
    features: [
      "Tablero de pipeline",
      "Puntaje de oportunidad",
      "Recordatorios de seguimiento",
      "Plantillas de propuesta",
    ],
  },
  {
    icon: FolderLock,
    title: "Control Documental",
    capability: "Contratos, pólizas, actas, versiones y vencimientos.",
    features: [
      "Repositorio centralizado",
      "Alertas de vencimiento",
      "Actas automáticas",
      "Estados de aprobación",
    ],
  },
  {
    icon: MessagesSquare,
    title: "Comunicación",
    capability: "Comunicación multicanal y seguimiento de stakeholders.",
    features: [
      "Resúmenes de reunión",
      "Borradores de correo",
      "Notificaciones",
      "Asignación de tareas",
    ],
  },
  {
    icon: Sparkles,
    title: "Copiloto de IA",
    capability: "Asistente de proyecto en lenguaje natural.",
    features: [
      "Explicación de riesgos",
      "Reportes ejecutivos",
      "Plan de acciones",
      "Respuestas sobre el proyecto",
    ],
  },
];

export function SolutionLayers() {
  return (
    <section id="solucion" className="bg-canvas-sunken py-section">
      <Container size="wide">
        <SectionHeader
          eyebrow="La solución"
          title={
            <>
              Una capa integrada de control para todo el ciclo del proyecto.
            </>
          }
          description="Seis capas que dejan de funcionar como herramientas sueltas y se vuelven un solo sistema operativo de construcción."
        />

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {layers.map(({ icon: Icon, ...layer }) => (
            <article
              key={layer.title}
              className="group relative flex flex-col bg-canvas-raised p-7 transition-colors hover:bg-white sm:p-8"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-canvas text-ink transition-colors group-hover:border-ink/30 group-hover:text-accent">
                  <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <h3 className="font-display text-xl text-ink">{layer.title}</h3>
              </div>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
                {layer.capability}
              </p>
              <ul className="mt-6 space-y-2 border-t border-line pt-5">
                {layer.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2.5 text-sm text-ink"
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block h-1 w-1 rounded-full bg-ink-soft"
                    />
                    {f}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
