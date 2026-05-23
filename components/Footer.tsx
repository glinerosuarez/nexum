import Link from "next/link";
import { Container } from "./Container";

const columns = [
  {
    title: "Producto",
    links: [
      { href: "#solucion", label: "Solución" },
      { href: "#metodologia", label: "Metodología" },
      { href: "#producto", label: "Etapas del producto" },
      { href: "#copiloto", label: "Copiloto de IA" },
    ],
  },
  {
    title: "Compañía",
    links: [
      { href: "#audiencia", label: "Para quién" },
      { href: "#contacto", label: "Contacto" },
      { href: "#", label: "Roadmap" },
      { href: "#", label: "Prensa" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "#", label: "Privacidad" },
      { href: "#", label: "Términos" },
      { href: "#", label: "Seguridad" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-canvas">
      <Container size="wide">
        <div className="grid gap-12 py-16 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Nexum">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-ink text-canvas">
                <svg
                  viewBox="0 0 20 20"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M3 16V4l14 12V4" />
                </svg>
              </span>
              <span className="font-display text-xl leading-none tracking-tight">
                Nexum
              </span>
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink-muted">
              Plataforma PMO y ERP/CRM para construcción impulsada por IA.
              Diseñada para constructoras colombianas y firmas de infraestructura
              de la región Caribe.
            </p>
            <p className="mt-6 text-xs text-ink-soft">
              Hecho en Colombia · Prototipo de hackathon v2.0
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
            {columns.map((col) => (
              <div key={col.title}>
                <h3 className="text-xs font-medium uppercase tracking-[0.16em] text-ink-soft">
                  {col.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        className="text-sm text-ink transition-colors hover:text-accent"
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-start justify-between gap-3 border-t border-line py-6 sm:flex-row sm:items-center">
          <p className="text-xs text-ink-soft">
            © {new Date().getFullYear()} Nexum Project. Todos los derechos
            reservados.
          </p>
          <p className="text-xs text-ink-soft">
            Confidencial · Definición de prototipo de hackathon
          </p>
        </div>
      </Container>
    </footer>
  );
}
