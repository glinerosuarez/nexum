import { ArrowRight, CircleAlert, CircleCheck, CircleDot } from "lucide-react";
import { Button } from "./Button";
import { Container } from "./Container";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-12 sm:pt-16 lg:pt-24">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-[680px] grid-bg opacity-[0.65] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,black,transparent_70%)]"
      />
      <Container size="wide">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <span className="eyebrow mb-7">
              <span className="inline-block h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
              Nuevo · Construcción + IA · Colombia
            </span>

            <h1 className="font-display text-display-xl text-ink">
              El sistema operativo{" "}
              <span className="italic text-ink-muted">PMO</span> para
              constructoras impulsado por IA.
            </h1>

            <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-muted">
              Nexum centraliza control de proyectos, ejecución ágil, comercial,
              documentos y comunicaciones. Combina gobernanza PMI, rutinas Last
              Planner e inteligencia predictiva para que tu equipo decida con
              datos, no con archivos sueltos.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button href="#contacto" size="lg" withArrow>
                Solicitar demo
              </Button>
              <Button href="#producto" variant="secondary" size="lg">
                Ver el producto
                <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            <dl className="mt-12 grid grid-cols-2 gap-x-8 gap-y-4 border-t border-line pt-8 sm:grid-cols-3">
              {[
                { k: "Vista única", v: "Portafolio, obra y comercial" },
                { k: "PMI + Ágil", v: "WBS, SPI/CPI, Kanban, Last Planner" },
                { k: "Copiloto IA", v: "Reportes, riesgos y borradores" },
              ].map((stat) => (
                <div key={stat.k}>
                  <dt className="text-xs font-medium uppercase tracking-[0.14em] text-ink-soft">
                    {stat.k}
                  </dt>
                  <dd className="mt-1.5 text-sm text-ink">{stat.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="lg:col-span-5">
            <HeroVisual />
          </div>
        </div>
      </Container>
    </section>
  );
}

function HeroVisual() {
  return (
    <div className="relative animate-fade-up [animation-delay:120ms]">
      <div
        aria-hidden="true"
        className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-accent/15 via-transparent to-transparent blur-2xl"
      />
      <div className="rounded-2xl border border-line bg-canvas-raised p-5 shadow-card">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
            <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
            <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          </div>
          <span className="font-mono text-[11px] tracking-tight text-ink-soft">
            nexum.co/portafolio
          </span>
          <span className="h-2.5 w-2.5" />
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">
              Portafolio · Constructora Andes
            </p>
            <p className="mt-1 font-display text-2xl text-ink">12 proyectos activos</p>
          </div>
          <span className="rounded-full border border-line bg-canvas px-2.5 py-1 text-[11px] font-medium text-ink-muted">
            Mayo · 2026
          </span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            { label: "SPI portafolio", value: "0.94", tone: "warn" },
            { label: "CPI portafolio", value: "1.02", tone: "ok" },
            { label: "Riesgos abiertos", value: "7", tone: "risk" },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-line bg-canvas p-3"
            >
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                {kpi.label}
              </p>
              <p className="mt-1.5 font-mono text-xl text-ink">{kpi.value}</p>
              <span
                className={`mt-2 inline-flex h-1.5 w-8 rounded-full ${
                  kpi.tone === "ok"
                    ? "bg-status-ok"
                    : kpi.tone === "warn"
                    ? "bg-status-warn"
                    : "bg-status-risk"
                }`}
              />
            </div>
          ))}
        </div>

        <ul className="mt-5 space-y-2.5">
          {[
            {
              icon: <CircleAlert className="h-4 w-4 text-status-risk" />,
              title: "Torre Marbella — retraso de cronograma",
              meta: "SPI 0.82 · 4 tareas vencidas",
            },
            {
              icon: <CircleDot className="h-4 w-4 text-status-warn" />,
              title: "Edificio Caribe — póliza por vencer",
              meta: "12 días · Contrato 045",
            },
            {
              icon: <CircleCheck className="h-4 w-4 text-status-ok" />,
              title: "Vía Cartagena — entrega aprobada",
              meta: "Acta generada por IA",
            },
          ].map((row) => (
            <li
              key={row.title}
              className="flex items-start gap-3 rounded-xl border border-line bg-canvas px-3 py-2.5"
            >
              <span className="mt-0.5">{row.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{row.title}</p>
                <p className="truncate text-xs text-ink-soft">{row.meta}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded-xl border border-dashed border-line bg-accent-soft/60 p-3.5">
          <p className="text-[11px] uppercase tracking-[0.14em] text-accent">
            Copiloto Nexum
          </p>
          <p className="mt-1.5 text-sm text-ink">
            “Torre Marbella entra en riesgo por bloqueador eléctrico sin
            responsable. Sugiero reasignar a J. Pérez y mover la entrega 5 días.”
          </p>
        </div>
      </div>
    </div>
  );
}
