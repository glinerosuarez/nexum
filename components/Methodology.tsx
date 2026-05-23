import { Container } from "./Container";
import { SectionHeader } from "./SectionHeader";

const frameworks = [
  {
    tag: "PMI",
    title: "Gobernanza estructurada",
    body: "Inicio, planificación, ejecución, monitoreo y cierre. Alcance, cronograma, costos, calidad, recursos, comunicaciones, riesgos, adquisiciones y stakeholders organizados por dominio.",
    points: [
      "WBS / EDT por proyecto",
      "Control ejecutivo por dominio",
      "Trazabilidad de decisiones",
    ],
  },
  {
    tag: "Ágil",
    title: "Ejecución de ciclo corto",
    body: "Scrum, Kanban, Lean Construction y Last Planner System aplicados a obra. Tableros, compromisos, bloqueadores y standups que se conectan al portafolio.",
    points: [
      "Kanban + lookahead semanal",
      "Compromisos y bloqueadores",
      "Coordinación en campo",
    ],
  },
  {
    tag: "IA",
    title: "Decisiones asistidas",
    body: "Alertas predictivas, recomendaciones operativas, detección de riesgos y consultas de proyecto en lenguaje natural. Cada salida con razón explicable y acción sugerida.",
    points: [
      "Alertas tempranas",
      "Reportes generados",
      "Recomendaciones explicables",
    ],
  },
];

export function Methodology() {
  return (
    <section id="metodologia" className="py-section">
      <Container size="wide">
        <SectionHeader
          eyebrow="Marco metodológico"
          title={
            <>
              PMI <span className="italic text-ink-muted">+</span> Ágil{" "}
              <span className="italic text-ink-muted">+</span> IA, en un mismo
              flujo.
            </>
          }
          description="Disciplina PMO con la agilidad operativa que la construcción necesita, potenciada por IA que reduce el trabajo administrativo y anticipa riesgos."
        />

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {frameworks.map((f, idx) => (
            <article
              key={f.tag}
              className="relative flex flex-col rounded-2xl border border-line bg-canvas-raised p-7 transition-shadow hover:shadow-card sm:p-8"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full border border-line bg-canvas px-3 py-1 font-mono text-[11px] tracking-tight text-ink">
                  {f.tag}
                </span>
                <span className="font-mono text-[11px] text-ink-soft">
                  {String(idx + 1).padStart(2, "0")} / 03
                </span>
              </div>
              <h3 className="mt-6 font-display text-2xl text-ink">{f.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
                {f.body}
              </p>
              <ul className="mt-6 space-y-2 border-t border-line pt-5 text-sm text-ink">
                {f.points.map((p) => (
                  <li key={p} className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="inline-block h-1 w-1 rounded-full bg-accent"
                    />
                    {p}
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
