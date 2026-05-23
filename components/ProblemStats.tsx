import { Container } from "./Container";

const problems = [
  {
    n: "01",
    title: "Herramientas fragmentadas",
    body: "Excel, WhatsApp, Project, cadenas de correo y carpetas físicas. Información dispersa, sin trazabilidad real.",
  },
  {
    n: "02",
    title: "Sin control en tiempo real",
    body: "El director no ve cronograma, costos, riesgos y comercial en una sola vista ejecutiva consolidada.",
  },
  {
    n: "03",
    title: "Reacción, no predicción",
    body: "Los retrasos y sobrecostos aparecen tarde. Faltan señales SPI/CPI y recomendaciones tempranas.",
  },
  {
    n: "04",
    title: "PMO, obra y ventas desconectadas",
    body: "Gobernanza, ejecución en campo y pipeline comercial viven en sistemas separados, sin un portafolio unificado.",
  },
];

export function ProblemStats() {
  return (
    <section className="py-section">
      <Container size="wide">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <span className="eyebrow mb-5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
              El problema
            </span>
            <h2 className="font-display text-display-lg text-ink">
              La construcción colombiana opera con sistemas que no hablan entre sí.
            </h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-muted">
              Baja madurez digital, adopción limitada de IA y herramientas
              genéricas que no entienden la realidad de obra. El resultado:
              sobrecostos, retrasos y decisiones tarde.
            </p>
          </div>

          <div className="lg:col-span-7">
            <ol className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
              {problems.map((p) => (
                <li
                  key={p.n}
                  className="group bg-canvas-raised p-7 transition-colors hover:bg-white sm:p-8"
                >
                  <span className="font-mono text-[11px] tracking-tight text-ink-soft">
                    {p.n}
                  </span>
                  <h3 className="mt-4 font-display text-2xl text-ink">
                    {p.title}
                  </h3>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-ink-muted">
                    {p.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Container>
    </section>
  );
}
