"use client";

import type { OffersSort, PriceOffer } from "@contracts";
import { ChevronDown, SearchX, Store } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow, chipClass, SearchField } from "@/components/ui/controls";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, Select } from "@/components/ui/primitives";
import { PAGE_PARAM } from "@/lib/pagination";
import { withParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { OfferCard } from "@/modules/offers/components/offer-card";
import { type PickerStore, StorePicker } from "@/modules/offers/components/store-picker";

const SORT_OPTIONS: ReadonlyArray<{ value: OffersSort; label: string }> = [
  { value: "featured", label: "Em destaque" },
  { value: "price", label: "Menor preço por kg/litro" },
  { value: "validity", label: "Vence primeiro" },
  { value: "recent", label: "Mais recentes" },
];

const SEARCH_DEBOUNCE_MS = 350;
const numberFormatter = new Intl.NumberFormat("pt-BR");

export interface OffersFilters {
  q: string;
  storeId: string | null;
  expiring: boolean;
  sort: OffersSort;
}

interface OffersExplorerProps {
  /** A página atual, já filtrada, ordenada e paginada pelo servidor. */
  offers: readonly PriceOffer[];
  total: number;
  page: number;
  pageSize: number;
  stores: readonly PickerStore[];
  filters: OffersFilters;
}

/**
 * Ofertas com busca, ordenação, filtro de mercado e paginação. O ESTADO MORA NA URL
 * (?q=&loja=&vence=&ordem=&pagina=): o servidor decide a página, o link é compartilhável e o botão
 * voltar funciona. Aqui só ficam os controles; nada é filtrado no navegador, porque a cidade pode
 * ter milhares de ofertas.
 */
export function OffersExplorer({
  offers,
  total,
  page,
  pageSize,
  stores,
  filters,
}: OffersExplorerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.q);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const lastPushedQuery = useRef(filters.q);

  /** Troca os filtros na URL e volta para a página 1 (a página antiga não faz mais sentido). */
  function navigate(updates: Record<string, string | null>) {
    const href = `${pathname}${withParams(searchParams, { [PAGE_PARAM]: null, ...updates })}`;
    startTransition(() => router.replace(href, { scroll: false }));
  }

  // Busca: espera o usuário parar de digitar antes de pedir ao servidor.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `navigate` muda a cada render; só `query` deve disparar
  useEffect(() => {
    const term = query.trim();
    if (term === lastPushedQuery.current) return;
    const timer = setTimeout(() => {
      lastPushedQuery.current = term;
      navigate({ q: term || null });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const selectedStore = filters.storeId
    ? (stores.find((store) => store.id === filters.storeId) ?? null)
    : null;
  const hasFilters =
    filters.q !== "" || filters.storeId !== null || filters.expiring || filters.sort !== "featured";

  function clearAll() {
    setQuery("");
    lastPushedQuery.current = "";
    startTransition(() => router.replace(pathname, { scroll: false }));
  }

  const hrefFor = (target: number) =>
    `${pathname}${withParams(searchParams, { [PAGE_PARAM]: target === 1 ? null : target })}`;

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
            value={filters.sort}
            onChange={(event) =>
              navigate({ ordem: event.target.value === "featured" ? null : event.target.value })
            }
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
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setIsPickerOpen(true)}
          className={cn(chipClass(filters.storeId !== null), "max-w-full")}
        >
          <Store aria-hidden className="size-4 shrink-0" />
          <span className="truncate">
            {filters.storeId !== null ? (selectedStore?.name ?? "Mercado escolhido") : "Mercado"}
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0" />
        </button>
        <Chip
          selected={filters.expiring}
          onClick={() => navigate({ vence: filters.expiring ? null : "1" })}
        >
          Vence em breve
        </Chip>
      </ChipRow>

      <p aria-live="polite" className="type-caption px-1">
        {total === 0
          ? "Nenhuma oferta"
          : `${numberFormatter.format(total)} ${total === 1 ? "oferta" : "ofertas"}`}
        {hasFilters && total > 0 ? (
          <>
            {" · "}
            <button type="button" onClick={clearAll} className="font-medium text-brand">
              limpar filtros
            </button>
          </>
        ) : null}
      </p>

      {offers.length === 0 ? (
        <EmptyState
          icon={<SearchX aria-hidden className="size-8" />}
          title="Nenhuma oferta com esses filtros"
          description="Tente outra palavra ou volte a mostrar todos os mercados."
          action={<Button onClick={clearAll}>Limpar filtros</Button>}
        />
      ) : (
        <div
          aria-busy={isPending}
          className={cn(
            "grid grid-cols-1 gap-3 transition-opacity duration-200 md:grid-cols-2",
            isPending && "opacity-60",
          )}
        >
          {offers.map((offer) => (
            <OfferCard key={`${offer.storeId}-${offer.productId}`} offer={offer} />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        hrefFor={hrefFor}
        className="pt-2"
      />

      <StorePicker
        open={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        stores={stores}
        selectedId={filters.storeId}
        onSelect={(storeId) => navigate({ loja: storeId })}
      />
    </div>
  );
}
