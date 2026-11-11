import { Badge, Card, EmptyState, formatBRLUnit } from "@compara/ui";
import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SearchBox } from "@/features/catalog/components/search-box";
import { searchProducts } from "@/shared/api/endpoints";
import { formatSize } from "@/shared/lib/format";

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
        <ul className="space-y-3" aria-label={`Resultados para ${searchTerm}`}>
          {productHits.map((hit) => (
            <li key={hit.productId}>
              <Link href={`/produto/${hit.productId}`} className="block rounded-2xl">
                <Card className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-surface-muted">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{hit.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {[hit.brand, formatSize(hit.sizeValue, hit.sizeUnit)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {hit.minUnitPriceCents !== null ? (
                      <>
                        <p className="text-xl font-semibold tabular-nums">
                          {formatBRLUnit(hit.minUnitPriceCents, hit.baseUnit)}
                        </p>
                        <Badge>
                          {hit.storeCount} mercado{hit.storeCount === 1 ? "" : "s"}
                        </Badge>
                      </>
                    ) : (
                      <Badge tone="warning">sem preço</Badge>
                    )}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
