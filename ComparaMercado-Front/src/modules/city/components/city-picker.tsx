"use client";

import { type City, type CityDetail, CitySearchResponseSchema } from "@contracts";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { rowClass, SearchField } from "@/components/ui/controls";
import { Group, GroupRow, Select } from "@/components/ui/primitives";
import { DetailSheet } from "@/components/ui/sheet";
import { UFS } from "@/lib/ufs";
import { cn } from "@/lib/utils";
import { selectCityAction } from "../actions";

/** Pausa de digitação antes de buscar (a busca vai ao servidor a cada pausa). */
const SEARCH_DEBOUNCE_MS = 250;
/** Com menos letras que isto a API devolve os atalhos (cidades com mercados), não uma busca. */
const MIN_QUERY_LENGTH = 2;

type SearchStatus = "loading" | "ready" | "error";

function coverageLabel(city: CityDetail): string {
  if (city.coverage === "coming_soon") return "Em breve";
  return city.storeCount === 1 ? "1 mercado" : `${city.storeCount} mercados`;
}

/**
 * Botão com a cidade em uso; abre um sheet para buscar e trocar. A busca cobre todos os
 * municípios do IBGE (sem acento e tolerante a erro de digitação); escolher um que ainda não tem
 * mercados também vale ("Em breve"). A troca vale na hora (cookie e, com sessão, perfil) e a
 * página recarrega os dados no servidor.
 */
export function CityPicker({
  cities,
  selected,
}: {
  /** Atalhos mostrados antes de digitar: as cidades que já têm mercados. */
  cities: City[];
  selected: Pick<City, "id" | "name" | "uf"> | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [uf, setUf] = useState("");
  const [results, setResults] = useState<CityDetail[] | null>(null);
  const [status, setStatus] = useState<SearchStatus>("loading");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();
  const searching = trimmed.length >= MIN_QUERY_LENGTH || uf !== "";

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        setStatus("loading");
        try {
          const params = new URLSearchParams();
          if (trimmed.length >= MIN_QUERY_LENGTH) params.set("q", trimmed);
          if (uf) params.set("uf", uf);
          const response = await fetch(`/api/cidades?${params}`, { signal: controller.signal });
          if (!response.ok) throw new Error(`busca de cidades: ${response.status}`);
          setResults(CitySearchResponseSchema.parse(await response.json()).cities);
          setStatus("ready");
        } catch {
          if (!controller.signal.aborted) setStatus("error");
        }
      },
      trimmed.length >= MIN_QUERY_LENGTH ? SEARCH_DEBOUNCE_MS : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, trimmed, uf]);

  function choose(cityId: string) {
    setError(null);
    startTransition(async () => {
      const result = await selectCityAction(cityId);
      if (result.ok) setOpen(false);
      else setError(result.message);
    });
  }

  // Enquanto a primeira resposta não chega, os atalhos vindos do servidor já ocupam a lista.
  const rows: { id: string; name: string; uf: string; detail: CityDetail | null }[] =
    results && (status === "ready" || searching)
      ? results.map((city) => ({ id: city.id, name: city.name, uf: city.uf, detail: city }))
      : cities.map((city) => ({ id: city.id, name: city.name, uf: city.uf, detail: null }));

  const heading = searching
    ? uf && trimmed.length < MIN_QUERY_LENGTH
      ? `Cidades de ${UFS.find((item) => item.uf === uf)?.name ?? uf}`
      : "Resultados"
    : "Cidades com mercados";

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={selected ? `Cidade: ${selected.name}. Trocar cidade` : "Escolher cidade"}
      >
        <MapPin aria-hidden className="size-4" />
        {selected ? `${selected.name} · ${selected.uf}` : "Escolher cidade"}
        <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
      </Button>

      <DetailSheet open={open} onOpenChange={setOpen} title="Sua cidade">
        <p className="type-caption pb-3">
          Procure o seu município. Mostramos os mercados e preços da cidade escolhida; se ainda não
          houver mercados nela, avisamos que está em breve.
        </p>

        <div className="space-y-2 pb-3">
          <SearchField
            label="Buscar cidade"
            placeholder="Digite o nome da cidade"
            value={query}
            onValueChange={setQuery}
          />
          <Select
            aria-label="Filtrar por estado"
            value={uf}
            onChange={(event) => setUf(event.target.value)}
          >
            <option value="">Todos os estados</option>
            {UFS.map((item) => (
              <option key={item.uf} value={item.uf}>
                {item.name} ({item.uf})
              </option>
            ))}
          </Select>
        </div>

        <h3 className="type-caption pb-2 font-semibold uppercase tracking-wide">{heading}</h3>
        <p role="status" aria-live="polite" className="sr-only">
          {status === "loading"
            ? "Buscando cidades"
            : status === "error"
              ? "Não foi possível buscar agora"
              : `${rows.length} ${rows.length === 1 ? "cidade encontrada" : "cidades encontradas"}`}
        </p>

        {status === "error" ? (
          <p role="alert" className="pb-3 text-sm text-danger">
            Não foi possível buscar agora. Confira a conexão e tente de novo.
          </p>
        ) : null}

        {rows.length > 0 ? (
          <Group
            aria-busy={pending || status === "loading"}
            className={cn(pending && "opacity-60")}
          >
            {rows.map((city) => (
              <GroupRow key={city.id}>
                <button
                  type="button"
                  className={rowClass}
                  disabled={pending}
                  aria-pressed={city.id === selected?.id}
                  onClick={() => choose(city.id)}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {city.name} · {city.uf}
                  </span>
                  {city.detail ? (
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        city.detail.coverage === "available"
                          ? "text-muted-foreground"
                          : "rounded-full bg-fill px-2 py-0.5 font-medium text-muted-foreground",
                      )}
                    >
                      {coverageLabel(city.detail)}
                    </span>
                  ) : null}
                  {city.id === selected?.id ? (
                    <Check aria-hidden className="size-5 shrink-0 text-brand" />
                  ) : null}
                </button>
              </GroupRow>
            ))}
          </Group>
        ) : status === "ready" ? (
          <p className="rounded-2xl bg-surface px-4 py-6 text-center text-sm text-muted-foreground">
            {searching
              ? "Nenhuma cidade encontrada. Confira a grafia ou escolha o estado."
              : "Digite o nome da sua cidade para começar."}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="pt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </DetailSheet>
    </>
  );
}
