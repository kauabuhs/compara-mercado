import { OffersSortSchema } from "@contracts";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { LIST_PAGE_SIZE, PAGE_PARAM, parsePage, totalPages } from "@/lib/pagination";
import { withParams } from "@/lib/search-params";
import { OffersExplorer } from "@/modules/offers/components/offers-explorer";
import { listOffers, listStores } from "@/services/api/endpoints";

export const metadata: Metadata = { title: "Ofertas da semana" };

const MAX_QUERY_LENGTH = 80;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OffersPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;

  // A URL é entrada do usuário: valores inválidos são ignorados em vez de virarem erro 400 da API.
  const q = (firstValue(params["q"]) ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const storeId = z.uuid().safeParse(firstValue(params["loja"])).data ?? null;
  const expiring = firstValue(params["vence"]) === "1";
  const sort = OffersSortSchema.safeParse(firstValue(params["ordem"])).data ?? "featured";
  const requestedPage = parsePage(params[PAGE_PARAM]);

  const [result, stores] = await Promise.all([
    listOffers({
      page: requestedPage,
      pageSize: LIST_PAGE_SIZE,
      sort,
      expiringSoon: expiring,
      ...(q ? { q } : {}),
      ...(storeId ? { storeId } : {}),
    }),
    listStores(),
  ]);

  // Página além do fim (link antigo, lista que encolheu): leva à última página que existe.
  if (result.offers.length === 0 && result.total > 0 && requestedPage > 1) {
    const lastPage = totalPages(result.total, LIST_PAGE_SIZE);
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const single = firstValue(value);
      if (single !== undefined && key !== PAGE_PARAM) query.set(key, single);
    }
    redirect(`/ofertas${withParams(query, { [PAGE_PARAM]: lastPage === 1 ? null : lastPage })}`);
  }

  const hasFilters = q !== "" || storeId !== null || expiring || sort !== "featured";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ofertas da semana"
        description="Promoções vigentes nos mercados da cidade."
      />
      {result.total === 0 && !hasFilters ? (
        <EmptyState
          title="Nenhuma oferta vigente"
          description="As promoções aparecem aqui assim que os mercados publicam os encartes."
        />
      ) : (
        <OffersExplorer
          offers={result.offers}
          total={result.total}
          page={result.page}
          pageSize={result.pageSize}
          stores={stores.map((store) => ({
            id: store.id,
            name: store.name,
            neighborhood: store.neighborhood,
            address: store.address,
          }))}
          filters={{ q, storeId, expiring, sort }}
        />
      )}
    </div>
  );
}
