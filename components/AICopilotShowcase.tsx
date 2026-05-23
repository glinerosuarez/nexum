import { Sparkles, ShieldCheck, FileText, Send } from "lucide-react";
import { Container } from "./Container";
import { SectionHeader } from "./SectionHeader";

const capabilities = [
  {
    icon: ShieldCheck,
    title: "Explicabilidad",
    body: "Cada alerta roja o amarilla incluye la razón en lenguaje claro y una acción recomendada.",
  },
  {
    icon: FileText,
    title: "Reportes ejecutivos",
    body: "Resumen de portafolio, riesgos, costos y próximos pasos generados en menos de 30 segundos.",
  },
  {
    icon: Send,
    title: "Borradores listos",
    body: "Actualizaciones para cliente, actas de reunión y correos en español, con revisión humana antes de enviar.",
  },
];

export function AICopilotShowcase() {
  return (
    <section id="copiloto" className="py-section">
      <Container size="wide">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeader
              eyebrow="Copiloto de IA"
              title={
                <>
                  Pregunta en español. Recibe decisiones, no solo datos.
                </>
              }
              description="El copiloto entiende tus proyectos, explica por qué algo está en riesgo y propone qué hacer. Todo con razón subyacente y revisión humana antes de enviar."
            />

            <ul className="mt-10 grid gap-5">
              {capabilities.map(({ icon: Icon, ...c }) => (
                <li key={c.title} className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-canvas-raised text-accent">
                    <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-[15px] font-medium text-ink">
                      {c.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                      {c.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-7">
            <CopilotChat />
          </div>
        </div>
      </Container>
    </section>
  );
}

function CopilotChat() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-accent/12 via-transparent to-transparent blur-3xl"
      />
      <div className="overflow-hidden rounded-2xl border border-line bg-canvas-raised shadow-card">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2 text-ink">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
            <span className="text-sm font-medium">Copiloto Nexum</span>
          </div>
          <span className="font-mono text-[11px] text-ink-soft">
            proyecto · torre marbella
          </span>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          <Bubble role="user">
            ¿Por qué Torre Marbella está en riesgo esta semana?
          </Bubble>

          <Bubble role="assistant">
            <p className="text-ink">
              Torre Marbella entra en{" "}
              <span className="font-medium text-status-risk">riesgo alto</span>{" "}
              por tres señales combinadas:
            </p>
            <ul className="mt-2.5 space-y-1.5 text-sm text-ink-muted">
              <li>· SPI 0.82 — desviación de 8 días sobre el cronograma base.</li>
              <li>· 4 tareas vencidas en la cuadrilla de instalaciones.</li>
              <li>· Bloqueador eléctrico abierto hace 6 días sin responsable.</li>
            </ul>
            <p className="mt-3 text-ink">Acciones sugeridas:</p>
            <ol className="mt-2 space-y-1.5 text-sm text-ink-muted">
              <li>1. Reasignar bloqueador eléctrico a J. Pérez.</li>
              <li>2. Reprogramar entrega parcial al 12 de junio.</li>
              <li>3. Notificar al cliente con actualización generada.</li>
            </ol>
          </Bubble>

          <div className="flex flex-wrap gap-2 pt-2">
            {[
              "Generar reporte ejecutivo",
              "Borrador para cliente",
              "Acta de la reunión de hoy",
            ].map((s) => (
              <span
                key={s}
                className="rounded-full border border-line bg-canvas px-3 py-1.5 text-xs text-ink"
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-line px-5 py-3">
          <div className="flex-1 rounded-full border border-line bg-canvas px-4 py-2 text-sm text-ink-soft">
            Pregunta cualquier cosa sobre tu portafolio…
          </div>
          <button
            type="button"
            aria-label="Enviar mensaje"
            className="grid h-9 w-9 place-items-center rounded-full bg-ink text-canvas transition-colors hover:bg-[#1a1a1c]"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({
  role,
  children,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-ink px-4 py-2.5 text-sm text-canvas">
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-tl-md border border-line bg-canvas px-4 py-3 text-sm">
        {children}
      </div>
    </div>
  );
}
