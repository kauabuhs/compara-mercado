import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Nav } from "@/components/layout/nav";
import { SwRegister } from "@/components/shared/sw-register";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: { default: "Compara Mercado", template: "%s · Compara Mercado" },
  description:
    "Descubra em qual mercado da sua cidade a sua lista de compras sai mais barata hoje.",
  applicationName: "Compara Mercado",
  appleWebApp: { capable: true, title: "Compara Mercado", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Necessário para env(safe-area-inset-*) funcionar no iOS (pílula de navegação e margens).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfb" },
    { media: "(prefers-color-scheme: dark)", color: "#16181c" },
  ],
};

// Aplica o tema salvo antes da primeira pintura (evita "piscar" no modo escuro).
const themeScript = `try{var t=localStorage.getItem("compara:theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: script estático, sem entrada do usuário */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* suppressHydrationWarning: extensões do navegador (ex.: ColorZilla) injetam atributos no <body> antes do React hidratar */}
      <body className="min-h-dvh" suppressHydrationWarning>
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-foreground"
        >
          Pular para o conteúdo
        </a>
        <Nav />
        <div className="lg:pl-(--sidebar-width)">
          <main
            id="conteudo"
            className="page-gutter mx-auto w-full max-w-4xl pt-6 pb-(--nav-clearance) md:pt-10 lg:max-w-5xl lg:pb-16"
          >
            {children}
          </main>
        </div>
        <SwRegister />
      </body>
    </html>
  );
}
