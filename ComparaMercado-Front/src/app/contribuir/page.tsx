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
          description="Consultar e comparar não exige conta. Para fotografar etiquetas, entre com o seu e-mail: sem senha, mandamos um link."
          action={
            <Button asChild>
              <Link href="/conta">Entrar</Link>
            </Button>
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
        description="Fotografe a etiqueta de preço no mercado. Um revisor confere a foto e o preço aparece para todos."
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
