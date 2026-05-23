import { Button } from "./Button";
import { Container } from "./Container";

export function CTASection() {
  return (
    <section id="contacto" className="py-section">
      <Container size="wide">
        <div className="relative overflow-hidden rounded-3xl border border-line bg-ink px-7 py-14 text-canvas sm:px-12 sm:py-20">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-0 opacity-[0.07] noise"
          />
          <div
            aria-hidden="true"
            className="absolute -right-24 -top-24 -z-0 h-72 w-72 rounded-full bg-accent/30 blur-3xl"
          />

          <div className="relative grid gap-10 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <span className="eyebrow mb-5 text-canvas/60">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                Demo del prototipo
              </span>
              <h2 className="font-display text-display-lg text-canvas">
                Lleva tu PMO de hojas sueltas a un sistema operativo de
                construcción.
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-canvas/70">
                Agenda una demo guiada con datos de muestra de una constructora
                colombiana. Te mostramos el flujo completo: portafolio, control
                de proyecto, Kanban, CRM, documentos y copiloto de IA.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:col-span-4 lg:justify-end">
              <a
                href="mailto:hola@nexum.co?subject=Solicitar%20demo%20Nexum"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-canvas px-6 text-[15px] font-medium text-ink transition-colors hover:bg-white"
              >
                Solicitar demo
              </a>
              <Button
                href="#producto"
                variant="ghost"
                size="lg"
                className="border-canvas/15 text-canvas hover:bg-canvas/10 hover:border-canvas/25"
              >
                Ver el producto
              </Button>
            </div>
          </div>

          <dl className="relative mt-12 grid grid-cols-2 gap-6 border-t border-canvas/10 pt-8 sm:grid-cols-4">
            {[
              { k: "< 60s", v: "Para entender los riesgos del portafolio" },
              { k: "< 30s", v: "Para generar un reporte ejecutivo" },
              { k: "100%", v: "Trazabilidad: proyecto, responsable, fecha" },
              { k: "ES · CO", v: "Localizado en español y moneda COP" },
            ].map((m) => (
              <div key={m.k}>
                <dt className="font-display text-3xl text-canvas">{m.k}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-canvas/60">
                  {m.v}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </section>
  );
}
