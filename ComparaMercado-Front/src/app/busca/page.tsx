import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/primitives";
import { LIST_PAGE_SIZE, PAGE_PARAM, parsePage, totalPages } from "@/lib/pagination";
import { withParams } from "@/lib/search-params";
import { SearchBox } from "@/modules/catalog/components/search-box";
import { SearchResults } from "@/modules/catalog/components/search-results";
import { searchProducts } from "@/services/api/endpoints";

export const metadata: Metadata = { title: "Busca" };

const MIN_SEARCH_TERM_LENGTH = 2;
const MAX_SEARCH_TERM_LENGTH = 80;
const ONLY_PRICED_PARAM = "comPreco";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const searchTerm = (firstValue(params["q"]) ?? "").trim().slice(0, MAX_SEARCH_TERM_LENGTH);
  const onlyPriced = firstValue(params[ONLY_PRICED_PARAM]) === "1";
  const requestedPage = parsePage(params[PAGE_PARAM]);
  const hasSearchableTerm = searchTerm.length >= MIN_SEARCH_TERM_LENGTH;

  const results = hasSearchableTerm
    ? await searchProducts(searchTerm, {
        page: requestedPage,
        pageSize: LIST_PAGE_SIZE,
        onlyPriced,
      })
    : null;

  // Página além do fim (link antigo): leva à última página que existe.
  if (results && results.hits.length === 0 && results.total > 0 && requestedPage > 1) {
    const lastPage = totalPages(results.total, LIST_PAGE_SIZE);
    redirect(
      `/busca${withParams(`q=${encodeURIComponent(searchTerm)}`, {
        [ONLY_PRICED_PARAM]: onlyPriced ? "1" : null,
        [PAGE_PARAM]: lastPage === 1 ? null : lastPage,
      })}`,
    );
  }

  const baseQuery = new URLSearchParams({ q: searchTerm });
  if (onlyPriced) baseQuery.set(ONLY_PRICED_PARAM, "1");

  return (
    <div className="space-y-6">
      <SearchBox defaultValue={searchTerm} />

      {results === null ? (
        <EmptyState
          title="O que você quer comprar?"
          description="Digite pelo menos 2 letras. Tentamos entender mesmo com erro de digitação."
        />
      ) : results.total === 0 && !onlyPriced ? (
        <EmptyState
          icon={<SearchX aria-hidden className="size-8" />}
          title={`Nada encontrado para “${searchTerm}”`}
          description="Tente outra palavra, como o nome do produto sem a marca."
        />
      ) : (
        <SearchResults
          hits={results.hits}
          term={searchTerm}
          total={results.total}
          page={results.page}
          pageSize={results.pageSize}
          onlyPriced={onlyPriced}
          pageHref={(target) =>
            `/busca${withParams(baseQuery, { [PAGE_PARAM]: target === 1 ? null : target })}`
          }
          toggleOnlyPricedHref={`/busca${withParams(baseQuery, {
            [ONLY_PRICED_PARAM]: onlyPriced ? null : "1",
            [PAGE_PARAM]: null,
          })}`}
        />
      )}
    </div>
  );
}
