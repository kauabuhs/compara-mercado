import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Nav } from "@/shared/components/nav";
import { SwRegister } from "@/shared/components/sw-register";
import "./globals.css";

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
      <body className="min-h-dvh">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-foreground"
        >
          Pular para o conteúdo
        </a>
        <Nav />
        <main
          id="conteudo"
          className="mx-auto w-full max-w-3xl px-4 pt-6 pb-28 md:pt-10 md:pb-16 md:pl-[calc(15rem+2rem)] md:pr-8"
        >
          {children}
        </main>
        <SwRegister />
      </body>
    </html>
  );
}
