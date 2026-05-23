"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "./Button";
import { Container } from "./Container";

const links = [
  { href: "#solucion", label: "Solución" },
  { href: "#metodologia", label: "Metodología" },
  { href: "#producto", label: "Producto" },
  { href: "#copiloto", label: "Copiloto IA" },
  { href: "#audiencia", label: "Para quién" },
];

export function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handle = () => setScrolled(window.scrollY > 8);
    handle();
    window.addEventListener("scroll", handle, { passive: true });
    return () => window.removeEventListener("scroll", handle);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled
          ? "border-b border-line/80 bg-canvas/85 backdrop-blur"
          : "border-b border-transparent bg-canvas/0"
      }`}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-canvas"
      >
        Saltar al contenido
      </a>
      <Container size="wide">
        <nav
          aria-label="Principal"
          className="flex h-16 items-center justify-between gap-6"
        >
          <Link
            href="/"
            className="flex items-center gap-2.5"
            aria-label="Nexum — ir al inicio"
          >
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

          <ul className="hidden items-center gap-1 lg:flex">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="rounded-full px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-2 lg:flex">
            <Button href="#contacto" variant="ghost" size="sm">
              Iniciar sesión
            </Button>
            <Button href="#contacto" size="sm" withArrow>
              Solicitar demo
            </Button>
          </div>

          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full border border-line text-ink lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>

        {open ? (
          <div
            id="mobile-nav"
            className="border-t border-line py-4 lg:hidden"
          >
            <ul className="flex flex-col gap-1">
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="block rounded-lg px-3 py-2.5 text-[15px] text-ink-muted hover:bg-ink/5 hover:text-ink"
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-2">
              <Button href="#contacto" variant="secondary" size="md">
                Iniciar sesión
              </Button>
              <Button href="#contacto" size="md" withArrow>
                Solicitar demo
              </Button>
            </div>
          </div>
        ) : null}
      </Container>
    </header>
  );
}
