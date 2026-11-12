import type { Metadata } from "next";
import { connection } from "next/server";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { OffersExplorer } from "@/modules/offers/components/offers-explorer";
import { listOffers } from "@/services/api/endpoints";

export const metadata: Metadata = { title: "Ofertas da semana" };

export default async function OffersPage() {
  await connection();
  const offers = await listOffers({ limit: 100 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ofertas da semana"
        description="Promoções vigentes nos mercados da cidade."
      />
      {offers.length === 0 ? (
        <EmptyState
          title="Nenhuma oferta vigente"
          description="As promoções aparecem aqui assim que os mercados publicam os encartes."
        />
      ) : (
        <OffersExplorer offers={offers} />
      )}
    </div>
  );
}
