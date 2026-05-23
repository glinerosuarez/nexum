import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const siteUrl = "https://nexum.co";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Nexum — PMO inteligente para construcción",
    template: "%s · Nexum",
  },
  description:
    "Nexum es la plataforma PMO y ERP/CRM para construcción impulsada por IA. Combina PMI, ejecución ágil e inteligencia predictiva para centralizar proyectos, comercial, documentos y decisiones ejecutivas en una sola vista.",
  applicationName: "Nexum",
  keywords: [
    "Nexum",
    "PMO construcción",
    "ERP construcción",
    "CRM construcción",
    "PMI",
    "Agile construcción",
    "Last Planner",
    "IA construcción",
    "Colombia",
    "gestión de proyectos",
  ],
  authors: [{ name: "Nexum" }],
  creator: "Nexum",
  publisher: "Nexum",
  openGraph: {
    type: "website",
    locale: "es_CO",
    url: siteUrl,
    siteName: "Nexum",
    title: "Nexum — PMO inteligente para construcción",
    description:
      "Plataforma PMO y ERP/CRM para construcción impulsada por IA. Un solo sistema operativo para proyectos, riesgos, comercial, documentos y comunicaciones.",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Nexum — PMO inteligente para construcción",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexum — PMO inteligente para construcción",
    description:
      "Plataforma PMO y ERP/CRM para construcción impulsada por IA. Diseñada para constructoras colombianas.",
    images: ["/og-image.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#F7F6F2",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es-CO"
      className={`${inter.variable} ${display.variable} ${mono.variable}`}
    >
      <body className="min-h-screen bg-canvas text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
