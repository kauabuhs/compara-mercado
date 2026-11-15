import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/primitives";
import { TERMS_VERSION } from "@/lib/legal";

/** Moldura dos textos legais: título, versão vigente e o texto em colunas de leitura. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader title={title} description={`Versão ${TERMS_VERSION}`} />
      <div className="space-y-6 leading-relaxed [&_h2]:type-heading [&_h2]:mb-2 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </article>
  );
}
