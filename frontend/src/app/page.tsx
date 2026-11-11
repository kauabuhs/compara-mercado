import { Button, Card, EmptyState } from "@compara/ui";
import { ListChecks, MapPin } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { SearchBox } from "@/features/catalog/components/search-box";
import { OfferCard } from "@/features/offers/components/offer-card";
import { listOffers, listStores } from "@/shared/api/endpoints";

// Renderizada a cada requisição no servidor (SEO); o cache das leituras públicas fica na API.

export default async function HomePage() {
  await connection();
  const [offers, stores] = await Promise.all([listOffers({ limit: 6 }), listStores()]);

  return (
    <div className="space-y-10">
      <header className="space-y-4 pt-4">
        <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
          Onde a sua lista sai mais barata hoje?
        </h1>
        <p className="text-lg text-muted-foreground">
          Compare preços dos mercados da sua cidade. Sem cadastro para consultar.
        </p>
        <SearchBox />
      </header>

      <section aria-labelledby="atalhos" className="grid grid-cols-2 gap-3">
        <h2 id="atalhos" className="sr-only">
          Atalhos
        </h2>
        <Button asChild variant="secondary" size="lg">
          <Link href="/lista">
            <ListChecks aria-hidden className="size-5" /> Minha lista
          </Link>
        </Button>
        <Button asChild variant="secondary" size="lg">
          <Link href="/mercados">
            <MapPin aria-hidden className="size-5" /> Mercados
          </Link>
        </Button>
      </section>

      <section aria-labelledby="ofertas" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="ofertas" className="text-2xl font-semibold tracking-tight">
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
          <div className="space-y-3">
            {offers.map((offer) => (
              <OfferCard key={`${offer.storeId}-${offer.productId}`} offer={offer} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="proximos" className="space-y-3">
        <h2 id="proximos" className="text-2xl font-semibold tracking-tight">
          Mercados da cidade
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {stores.slice(0, 4).map((store) => (
            <Card key={store.id} className="p-4">
              <p className="font-medium">{store.name}</p>
              <p className="text-sm text-muted-foreground">{store.neighborhood ?? store.address}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
