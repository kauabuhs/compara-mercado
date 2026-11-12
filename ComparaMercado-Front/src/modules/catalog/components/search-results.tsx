"use client";

import type { ProductHit } from "@contracts";
import { SearchX } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/controls";
import { Badge, EmptyState, Group, GroupRow, ProductAvatar } from "@/components/ui/primitives";
import { formatBRLUnit, formatSize } from "@/lib/format";
import { normalizeText } from "@/lib/search";

const MAX_BRAND_CHIPS = 6;
const MIN_HITS_FOR_FILTERS = 5; // poucos resultados: filtros só atrapalham

/** Resultados da busca com filtros que só aparecem quando ajudam: "com preço" e marcas. */
export function SearchResults({ hits, term }: { hits: readonly ProductHit[]; term: string }) {
  const [onlyPriced, setOnlyPriced] = useState(false);
  const [brand, setBrand] = useState<string | null>(null);

  const brands = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const hit of hits) {
      if (!hit.brand) continue;
      const key = normalizeText(hit.brand);
      const entry = counts.get(key) ?? { label: hit.brand, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
    return [...counts.entries()]
      .map(([key, { label, count }]) => ({ key, label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"))
      .slice(0, MAX_BRAND_CHIPS);
  }, [hits]);

  const visible = hits.filter(
    (hit) =>
      (!onlyPriced || hit.minUnitPriceCents !== null) &&
      (!brand || (hit.brand && normalizeText(hit.brand) === brand)),
  );
  const showFilters = hits.length >= MIN_HITS_FOR_FILTERS;
  const pricedCount = hits.filter((hit) => hit.minUnitPriceCents !== null).length;

  return (
    <div className="space-y-4">
      {showFilters ? (
        <ChipRow aria-label="Filtros">
          {pricedCount < hits.length ? (
            <Chip
              selected={onlyPriced}
              count={pricedCount}
              onClick={() => setOnlyPriced(!onlyPriced)}
            >
              Com preço
            </Chip>
          ) : null}
          {brands.length > 1
            ? brands.map((entry) => (
                <Chip
                  key={entry.key}
                  selected={brand === entry.key}
                  count={entry.count}
                  onClick={() => setBrand(brand === entry.key ? null : entry.key)}
                >
                  {entry.label}
                </Chip>
              ))
            : null}
        </ChipRow>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={<SearchX aria-hidden className="size-8" />}
          title="Nenhum resultado com esses filtros"
          action={
            <Button
              onClick={() => {
                setOnlyPriced(false);
                setBrand(null);
              }}
            >
              Limpar filtros
            </Button>
          }
        />
      ) : (
        <Group aria-label={`Resultados para ${term}`}>
          {visible.map((hit) => (
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
    </div>
  );
}
