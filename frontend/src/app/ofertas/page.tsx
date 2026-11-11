import { EmptyState } from "@compara/ui";
import type { Metadata } from "next";
import { connection } from "next/server";
import { OfferCard } from "@/features/offers/components/offer-card";
import { listOffers } from "@/shared/api/endpoints";

export const metadata: Metadata = { title: "Ofertas da semana" };

export default async function OffersPage() {
  await connection();
  const offers = await listOffers({ limit: 100 });
  const offersByStoreName = new Map<string, typeof offers>();
  for (const offer of offers) {
    offersByStoreName.set(offer.storeName, [
      ...(offersByStoreName.get(offer.storeName) ?? []),
      offer,
    ]);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">Ofertas da semana</h1>
      {offers.length === 0 ? (
        <EmptyState
          title="Nenhuma oferta vigente"
          description="As promoções aparecem aqui assim que os mercados publicam os encartes."
        />
      ) : (
        [...offersByStoreName].map(([storeName, storeOffers]) => (
          <section key={storeName} aria-label={`Ofertas de ${storeName}`} className="space-y-3">
            <h2 className="text-xl font-semibold">{storeName}</h2>
            {storeOffers.map((offer) => (
              <OfferCard key={`${offer.storeId}-${offer.productId}`} offer={offer} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
