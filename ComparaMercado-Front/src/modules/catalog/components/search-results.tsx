import type { ProductHit } from "@contracts";
import { SearchX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { chipClass } from "@/components/ui/controls";
import { Pagination } from "@/components/ui/pagination";
import { Badge, EmptyState, Group, GroupRow, ProductAvatar } from "@/components/ui/primitives";
import { formatBRLUnit, formatSize } from "@/lib/format";

interface SearchResultsProps {
  /** A página atual de resultados (a API já filtrou e paginou). */
  hits: readonly ProductHit[];
  term: string;
  total: number;
  page: number;
  pageSize: number;
  onlyPriced: boolean;
  /** Link da página `n` mantendo a busca e o filtro. */
  pageHref: (page: number) => string;
  /** Link que liga/desliga o filtro "Com preço" (volta à página 1). */
  toggleOnlyPricedHref: string;
}

/** Resultados da busca: filtro "Com preço" e paginação, ambos na URL (decididos no servidor). */
export function SearchResults({
  hits,
  term,
  total,
  page,
  pageSize,
  onlyPriced,
  pageHref,
  toggleOnlyPricedHref,
}: SearchResultsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href={toggleOnlyPricedHref}
          scroll={false}
          aria-current={onlyPriced ? "true" : undefined}
          className={chipClass(onlyPriced)}
        >
          Com preço
          {onlyPriced ? <span className="sr-only"> (filtro ativo)</span> : null}
        </Link>
        <p aria-live="polite" className="type-caption">
          {new Intl.NumberFormat("pt-BR").format(total)} {total === 1 ? "resultado" : "resultados"}
        </p>
      </div>

      {hits.length === 0 ? (
        <EmptyState
          icon={<SearchX aria-hidden className="size-8" />}
          title="Nenhum resultado com preço"
          description="Há produtos com esse nome, mas nenhum mercado tem preço vigente para eles."
          action={
            <Button asChild>
              <Link href={toggleOnlyPricedHref}>Mostrar todos</Link>
            </Button>
          }
        />
      ) : (
        <Group aria-label={`Resultados para ${term}`}>
          {hits.map((hit) => (
            <GroupRow key={hit.productId}>
              <Link
                href={`/produto/${hit.productId}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted active:bg-fill"
              >
                <ProductAvatar name={hit.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{hit.name}</p>
                  <p className="type-caption truncate">
                    {[hit.brand, formatSize(hit.sizeValue, hit.sizeUnit)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 space-y-1 text-right">
                  {hit.minUnitPriceCents !== null ? (
                    <>
                      <p className="text-lg font-semibold tabular-nums">
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
              </Link>
            </GroupRow>
          ))}
        </Group>
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        hrefFor={pageHref}
        className="pt-2"
      />
    </div>
  );
}
