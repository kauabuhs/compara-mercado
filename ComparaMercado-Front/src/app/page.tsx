import { Store } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { EmptyState, Group, GroupRow, IconTile } from "@/components/ui/primitives";
import { SearchBox } from "@/modules/catalog/components/search-box";
import { OfferCard } from "@/modules/offers/components/offer-card";
import { listOffers, listStores } from "@/services/api/endpoints";

// Renderizada a cada requisição no servidor (SEO); o cache das leituras públicas fica na API.

export default async function HomePage() {
  await connection();
  const [offers, stores] = await Promise.all([listOffers({ limit: 6 }), listStores()]);

  return (
    <div className="space-y-12">
      <header className="max-w-2xl space-y-4 pt-2 md:pt-4">
        <h1 className="type-display">Onde a sua lista sai mais barata hoje?</h1>
        <p className="text-lg text-muted-foreground">
          Compare preços dos mercados da sua cidade. Sem cadastro para consultar.
        </p>
        <SearchBox />
      </header>

      <section aria-labelledby="ofertas" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="ofertas" className="type-heading">
            Ofertas da semana
          </h2>
          <Link
            href="/ofertas"
            className="inline-flex min-h-11 items-center text-sm font-medium text-brand underline-offset-4 hover:underline"
          >
            Ver todas
          </Link>
        </div>
        {offers.length === 0 ? (
          <EmptyState
            title="Ainda não há ofertas"
            description="Assim que os mercados publicarem os encartes, elas aparecem aqui."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {offers.map((offer) => (
              <OfferCard key={`${offer.storeId}-${offer.productId}`} offer={offer} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="proximos" className="space-y-3">
        <h2 id="proximos" className="type-heading">
          Mercados da cidade
        </h2>
        <Group className="md:grid md:grid-cols-2 md:divide-y-0">
          {stores.slice(0, 4).map((store) => (
            <GroupRow key={store.id} className="flex items-center gap-3 px-4 py-3">
              <IconTile icon={Store} tone="info" />
              <div className="min-w-0">
                <p className="truncate font-medium">{store.name}</p>
                <p className="type-caption truncate">{store.neighborhood ?? store.address}</p>
              </div>
            </GroupRow>
          ))}
        </Group>
      </section>
    </div>
  );
}
