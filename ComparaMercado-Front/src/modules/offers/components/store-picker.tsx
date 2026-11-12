"use client";

import { Check, SearchX, Store, Tags } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RowContent, rowClass, SearchField } from "@/components/ui/controls";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, Group, GroupRow, IconTile } from "@/components/ui/primitives";
import { DetailSheet } from "@/components/ui/sheet";
import { clampPage, totalPages } from "@/lib/pagination";
import { searchItems } from "@/lib/search";

export interface PickerStore {
  id: string;
  name: string;
  neighborhood: string | null;
  address: string | null;
}

const PICKER_PAGE_SIZE = 12;

interface StorePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stores: readonly PickerStore[];
  /** `null` = todos os mercados. */
  selectedId: string | null;
  onSelect: (storeId: string | null) => void;
}

/**
 * Escolha de mercado num sheet: com 50+ mercados na cidade, um chip por mercado não cabe. Busca
 * por nome/bairro (sem acento, tolera erro de digitação) e lista paginada.
 */
export function StorePicker({
  open,
  onOpenChange,
  stores,
  selectedId,
  onSelect,
}: StorePickerProps) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  // Cada abertura começa do zero: sem busca antiga e na primeira página.
  useEffect(() => {
    if (open) {
      setQuery("");
      setPage(1);
    }
  }, [open]);

  const matches = useMemo(
    () => searchItems(stores, query, (store) => [store.name, store.neighborhood, store.address]),
    [stores, query],
  );
  const pages = totalPages(matches.length, PICKER_PAGE_SIZE);
  const currentPage = clampPage(page, pages);
  const visible = matches.slice(
    (currentPage - 1) * PICKER_PAGE_SIZE,
    currentPage * PICKER_PAGE_SIZE,
  );
  const showAllRow = query.trim() === "" && currentPage === 1;

  function choose(storeId: string | null) {
    onSelect(storeId);
    onOpenChange(false);
  }

  return (
    <DetailSheet open={open} onOpenChange={onOpenChange} title="Escolher mercado">
      <div className="space-y-4">
        <SearchField
          label="Buscar mercado"
          placeholder="Buscar mercado ou bairro"
          value={query}
          onValueChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
          maxLength={80}
        />

        {matches.length === 0 && !showAllRow ? (
          <EmptyState
            icon={<SearchX aria-hidden className="size-8" />}
            title="Nenhum mercado encontrado"
            description="Tente outro nome ou bairro."
          />
        ) : (
          <Group>
            {showAllRow ? (
              <GroupRow>
                <button
                  type="button"
                  aria-pressed={selectedId === null}
                  onClick={() => choose(null)}
                  className={rowClass}
                >
                  <RowContent
                    icon={<IconTile icon={Tags} tone="brand" />}
                    title="Todos os mercados"
                    description={`${stores.length} ${stores.length === 1 ? "mercado" : "mercados"}`}
                    trailing={
                      selectedId === null ? (
                        <Check aria-hidden className="size-5 text-brand" />
                      ) : null
                    }
                  />
                </button>
              </GroupRow>
            ) : null}
            {visible.map((store) => (
              <GroupRow key={store.id}>
                <button
                  type="button"
                  aria-pressed={store.id === selectedId}
                  onClick={() => choose(store.id)}
                  className={rowClass}
                >
                  <RowContent
                    icon={
                      <IconTile icon={Store} tone={store.id === selectedId ? "brand" : "info"} />
                    }
                    title={store.name}
                    description={[store.neighborhood, store.address].filter(Boolean).join(" · ")}
                    trailing={
                      store.id === selectedId ? (
                        <Check aria-hidden className="size-5 text-brand" />
                      ) : null
                    }
                  />
                </button>
              </GroupRow>
            ))}
          </Group>
        )}

        <Pagination
          page={currentPage}
          pageSize={PICKER_PAGE_SIZE}
          total={matches.length}
          onPageChange={setPage}
        />
      </div>
    </DetailSheet>
  );
}
