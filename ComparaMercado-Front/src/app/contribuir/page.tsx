import { Camera } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { ContributeForm } from "@/modules/contribute/components/contribute-form";
import { getSessionUser } from "@/server/session";
import { listStores } from "@/services/api/endpoints";

export const metadata: Metadata = { title: "Contribuir" };
export const dynamic = "force-dynamic"; // depende da sessão

export default async function ContributePage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader title="Contribuir" />
        <EmptyState
          icon={<Camera aria-hidden className="size-8" />}
          title="Entre para enviar preços"
          description="Consultar e comparar não exige conta. Para fotografar etiquetas, entre ou crie a sua conta."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/entrar?next=/contribuir">Entrar</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/cadastro?next=/contribuir">Criar conta</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const stores = await listStores();

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <PageHeader
        title="Contribuir"
        description="Fotografe a etiqueta de preço no mercado. Ele aparece na Comunidade como não confirmado e vira confirmado quando outras pessoas o confirmam ou a equipe o aprova."
      />
      <ContributeForm stores={stores.map((store) => ({ id: store.id, name: store.name }))} />
      <p className="text-center">
        <Link href="/conta/envios" className="type-label underline-offset-4 hover:underline">
          Ver meus envios
        </Link>
      </p>
    </div>
  );
}
