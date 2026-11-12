import { Camera } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Contribuir" };

// Fase 3: foto de etiqueta + leitura por IA + reputação. A base de banco (RLS, limite diário,
// observações pendentes) já existe; a captura e o envio pelo servidor entram nessa fase.
export default function ContributePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Contribuir" />
      <EmptyState
        icon={<Camera aria-hidden className="size-8" />}
        title="Envio de preços chega em breve"
        description="Em breve você poderá fotografar uma etiqueta de preço, confirmar em 2 toques e ganhar pontos."
      />
    </div>
  );
}
