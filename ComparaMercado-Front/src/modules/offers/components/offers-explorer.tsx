"use client";

import type { PriceOffer } from "@contracts";
import { SearchX } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow, SearchField } from "@/components/ui/controls";
import { EmptyState, Select } from "@/components/ui/primitives";
import { searchItems } from "@/lib/search";
import { OfferCard } from "@/modules/offers/components/offer-card";

type SortKey = "relevance" | "price" | "validity" | "recent";

const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: "relevance", label: "Em destaque" },
  { value: "price", label: "Menor preço" },
  { value: "validity", label: "Vence primeiro" },
  { value: "recent", label: "Mais recentes" },
];

const EXPIRING_SOON_DAYS = 3;
const DAY_MS = 86_400_000;

function isSortKey(value: string | null): value is SortKey {
  return SORT_OPTIONS.some((option) => option.value === value);
}

function isExpiringSoon(offer: PriceOffer, now: number): boolean {
  if (!offer.validTo) return false;
  const remaining = new Date(offer.validTo).getTime() - now;
  return remaining >= 0 && remaining <= EXPIRING_SOON_DAYS * DAY_MS;
}

/** Estado inicial vindo da URL (links compartilháveis); igual no servidor e no navegador. */
function readInitialParams(params: URLSearchParams) {
  const sort = params.get("ordem");
  return {
    query: params.get("q") ?? "",
    storeId: params.get("loja"),
    expiring: params.get("vence") === "1",
    sort: isSortKey(sort) ? sort : ("relevance" as SortKey),
  };
}

export function OffersExplorer({ offers }: { offers: readonly PriceOffer[] }) {
  const searchParams = useSearchParams();
  const [initial] = useState(() => readInitialParams(searchParams));
  const [query, setQuery] = useState(initial.query);
  const [storeId, setStoreId] = useState<string | null>(initial.storeId);
  const [expiringOnly, setExpiringOnly] = useState(initial.expiring);
  const [sort, setSort] = useState<SortKey>(initial.sort);

  // Mantém os filtros na URL (sem recarregar nem poluir o histórico): dá para copiar e compartilhar.
  useEffect(() => {
    const url = new URL(window.location.href);
    const entries: Array<[string, string | null]> = [
      ["q", query.trim() || null],
      ["loja", storeId],
      ["vence", expiringOnly ? "1" : null],
      ["ordem", sort === "relevance" ? null : sort],
    ];
    for (const [key, value] of entries) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, "", url);
  }, [query, storeId, expiringOnly, sort]);

  // Busca por texto primeiro: os contadores de cada mercado refletem o que o usuário digitou.
  const matchesQuery = useMemo(
    () => searchItems(offers, query, (offer) => [offer.productName, offer.brand, offer.storeName]),
    [offers, query],
  );

  const stores = useMemo(() => {
    const counts = new Map<string, { id: string; name: string; count: number }>();
    for (const offer of matchesQuery) {
      const entry = counts.get(offer.storeId) ?? {
        id: offer.storeId,
        name: offer.storeName,
        count: 0,
      };
      entry.count += 1;
      counts.set(offer.storeId, entry);
    }
    // Mantém o mercado escolhido visível mesmo se a busca zerar as ofertas dele.
    if (storeId !== null && !counts.has(storeId)) {
      const sample = offers.find((offer) => offer.storeId === storeId);
      if (sample) counts.set(storeId, { id: storeId, name: sample.storeName, count: 0 });
    }
    return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [matchesQuery, offers, storeId]);

  const visible = useMemo(() => {
    const now = Date.now();
    const filtered = matchesQuery.filter(
      (offer) =>
        (!storeId || offer.storeId === storeId) && (!expiringOnly || isExpiringSoon(offer, now)),
    );
    if (sort === "price") return [...filtered].sort((a, b) => a.priceCents - b.priceCents);
    if (sort === "validity") {
      const endOf = (offer: PriceOffer) =>
        offer.validTo ? new Date(offer.validTo).getTime() : Number.POSITIVE_INFINITY;
      return [...filtered].sort((a, b) => endOf(a) - endOf(b));
    }
    if (sort === "recent") return [...filtered].sort((a, b) => a.ageDays - b.ageDays);
    return filtered; // "em destaque": com busca, a ordem de relevância; sem busca, a da API
  }, [matchesQuery, storeId, expiringOnly, sort]);

  const hasFilters =
    query.trim() !== "" || storeId !== null || expiringOnly || sort !== "relevance";
  function clearAll() {
    setQuery("");
    setStoreId(null);
    setExpiringOnly(false);
    setSort("relevance");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchField
          label="Buscar nas ofertas"
          placeholder="Buscar produto, marca ou mercado"
          value={query}
          onValueChange={setQuery}
          maxLength={80}
          className="flex-1"
        />
        <div className="sm:w-52">
          <label htmlFor="ordem" className="sr-only">
            Ordenar por
          </label>
          <Select
            id="ordem"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="h-12 rounded-full pl-5"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <ChipRow aria-label="Filtros">
        <Chip selected={storeId === null} onClick={() => setStoreId(null)}>
          Todos os mercados
        </Chip>
        {stores.map((store) => (
          <Chip
            key={store.id}
            selected={storeId === store.id}
            count={store.count}
            onClick={() => setStoreId(storeId === store.id ? null : store.id)}
          >
            {store.name}
          </Chip>
        ))}
        <Chip selected={expiringOnly} onClick={() => setExpiringOnly(!expiringOnly)}>
          Vence em breve
        </Chip>
      </ChipRow>

      <p aria-live="polite" className="type-caption px-1">
        {visible.length === 0
          ? "Nenhuma oferta"
          : `${visible.length} ${visible.length === 1 ? "oferta" : "ofertas"}`}
        {hasFilters && visible.length > 0 ? (
          <>
            {" · "}
            <button type="button" onClick={clearAll} className="font-medium text-brand">
              limpar filtros
            </button>
          </>
        ) : null}
      </p>

      {visible.length === 0 ? (
        <EmptyState
          icon={<SearchX aria-hidden className="size-8" />}
          title="Nenhuma oferta com esses filtros"
          description="Tente outra palavra ou volte a mostrar todos os mercados."
          action={<Button onClick={clearAll}>Limpar filtros</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visible.map((offer) => (
            <OfferCard key={`${offer.storeId}-${offer.productId}`} offer={offer} />
          ))}
        </div>
      )}
    </div>
  );
}
