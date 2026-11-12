import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/primitives";
import { SearchBox } from "@/modules/catalog/components/search-box";
import { SearchResults } from "@/modules/catalog/components/search-results";
import { searchProducts } from "@/services/api/endpoints";

export const metadata: Metadata = { title: "Busca" };

const MIN_SEARCH_TERM_LENGTH = 2;
const MAX_SEARCH_TERM_LENGTH = 80;
const MAX_SEARCH_RESULTS = 30;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const resolvedSearchParams = await searchParams;
  const rawSearchTerm = Array.isArray(resolvedSearchParams.q)
    ? resolvedSearchParams.q[0]
    : resolvedSearchParams.q;
  const searchTerm = rawSearchTerm?.trim().slice(0, MAX_SEARCH_TERM_LENGTH) ?? "";
  const hasSearchableTerm = searchTerm.length >= MIN_SEARCH_TERM_LENGTH;
  const productHits = hasSearchableTerm ? await searchProducts(searchTerm, MAX_SEARCH_RESULTS) : [];

  return (
    <div className="space-y-6">
      <SearchBox defaultValue={searchTerm} />

      {!hasSearchableTerm ? (
        <EmptyState
          title="O que você quer comprar?"
          description="Digite pelo menos 2 letras. Tentamos entender mesmo com erro de digitação."
        />
      ) : productHits.length === 0 ? (
        <EmptyState
          icon={<SearchX aria-hidden className="size-8" />}
          title={`Nada encontrado para “${searchTerm}”`}
          description="Tente outra palavra, como o nome do produto sem a marca."
        />
      ) : (
        <SearchResults hits={productHits} term={searchTerm} />
      )}
    </div>
  );
}
