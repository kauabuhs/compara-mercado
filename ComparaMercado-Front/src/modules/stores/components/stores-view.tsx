"use client";

import { Navigation, Route, SearchX, Store, Tag, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip, SearchField } from "@/components/ui/controls";
import { EmptyState, Group, GroupRow, IconTile } from "@/components/ui/primitives";
import { formatDistance } from "@/lib/format";
import { searchItems } from "@/lib/search";
import { cn } from "@/lib/utils";
import type { MapStore } from "./store-map";

const MAP_HEIGHT = "h-[22rem] md:h-[28rem] lg:h-[32rem]";

// O mapa só carrega no navegador (MapLibre usa WebGL).
const StoreMap = dynamic(
  () => import("./store-map").then((storeMapModule) => storeMapModule.StoreMap),
  {
    ssr: false,
    loading: () => (
      <div aria-hidden className={cn("animate-pulse rounded-3xl bg-fill", MAP_HEIGHT)} />
    ),
  },
);

export interface StoreRow extends MapStore {
  neighborhood: string | null;
  address: string | null;
}

interface Coordinates {
  lat: number;
  lng: number;
}

/** Distância em linha reta (haversine), calculada no aparelho: a posição nunca sai do navegador. */
function haversineMeters(origin: Coordinates, destination: Coordinates): number {
  const EARTH_RADIUS_METERS = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(destination.lat - origin.lat);
  const longitudeDelta = toRadians(destination.lng - origin.lng);
  const haversineTerm =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(origin.lat)) *
      Math.cos(toRadians(destination.lat)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversineTerm));
}

function directionsUrl(store: Coordinates): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`;
}

export function StoresView({ stores }: { stores: StoreRow[] }) {
  const [query, setQuery] = useState("");
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapWrapperRef = useRef<HTMLDivElement>(null);

  // Busca instantânea (sem acento, tolera erro de digitação) e, com a posição, do mais perto ao mais longe.
  const visibleStores = useMemo(() => {
    const matches = searchItems(stores, query, (store) => [
      store.name,
      store.neighborhood,
      store.address,
    ]);
    const withDistance = matches.map((store) => ({
      ...store,
      meters: userLocation ? haversineMeters(userLocation, store) : null,
    }));
    return userLocation
      ? withDistance.sort((a, b) => (a.meters ?? 0) - (b.meters ?? 0))
      : withDistance;
  }, [stores, query, userLocation]);

  const selectedStore = visibleStores.find((store) => store.id === selectedId) ?? null;

  function selectStore(storeId: string | null) {
    setSelectedId(storeId);
    // No celular a lista fica abaixo do mapa: traz o mapa para a tela ao escolher um mercado.
    if (storeId) mapWrapperRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function requestUserLocation() {
    setGeoError(null);
    if (!("geolocation" in navigator)) return setGeoError("Seu aparelho não oferece localização.");
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => setGeoError("Não conseguimos sua localização. Você pode continuar sem ela."),
      { maximumAge: 300_000, timeout: 8000 },
    );
  }

  return (
    <div className="space-y-4">
      <div ref={mapWrapperRef} className="relative scroll-mt-4">
        <StoreMap
          stores={visibleStores}
          selectedId={selectedId}
          onSelect={selectStore}
          userLocation={userLocation}
          className={MAP_HEIGHT}
        />

        {selectedStore ? (
          <div className="glass-float absolute inset-x-3 bottom-3 z-10 animate-fade-in space-y-3 rounded-2xl p-3">
            <div className="flex items-center gap-3">
              <IconTile icon={Store} tone="brand" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{selectedStore.name}</p>
                <p className="type-caption truncate">
                  {[selectedStore.neighborhood, selectedStore.address].filter(Boolean).join(" · ")}
                </p>
              </div>
              {selectedStore.meters !== null ? (
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatDistance(selectedStore.meters)}
                </span>
              ) : null}
              <button
                type="button"
                aria-label="Fechar detalhes do mercado"
                onClick={() => setSelectedId(null)}
                className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-fill"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="secondary">
                <Link href={`/ofertas?loja=${selectedStore.id}`}>
                  <Tag aria-hidden className="size-4" /> Ver ofertas
                </Link>
              </Button>
              <Button asChild>
                <a href={directionsUrl(selectedStore)} target="_blank" rel="noopener noreferrer">
                  <Route aria-hidden className="size-4" /> Como chegar
                </a>
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchField
          label="Buscar mercado"
          placeholder="Buscar mercado ou bairro"
          value={query}
          onValueChange={setQuery}
          maxLength={80}
          className="flex-1"
        />
        <Chip selected={userLocation !== null} onClick={requestUserLocation} className="h-12 px-5">
          <Navigation aria-hidden className="size-4" />
          {userLocation ? "Atualizar minha posição" : "Ordenar por distância"}
        </Chip>
      </div>

      <p className="type-caption px-1">
        Usamos sua posição só para calcular a distância, aqui no seu aparelho. Nada é guardado.
      </p>
      {geoError ? (
        <p role="status" className="px-1 text-sm text-danger">
          {geoError}
        </p>
      ) : null}

      {visibleStores.length === 0 ? (
        <EmptyState
          icon={<SearchX aria-hidden className="size-8" />}
          title="Nenhum mercado encontrado"
          description="Tente outro nome ou bairro."
          action={<Button onClick={() => setQuery("")}>Limpar busca</Button>}
        />
      ) : (
        <Group>
          {visibleStores.map((store) => {
            const isSelected = store.id === selectedId;
            return (
              <GroupRow key={store.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => selectStore(isSelected ? null : store.id)}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted active:bg-fill",
                    isSelected && "bg-brand-soft hover:bg-brand-soft",
                  )}
                >
                  <IconTile icon={Store} tone={isSelected ? "brand" : "info"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{store.name}</p>
                    <p className="type-caption truncate">
                      {[store.neighborhood, store.address].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {store.meters !== null ? (
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatDistance(store.meters)}
                    </span>
                  ) : null}
                </button>
              </GroupRow>
            );
          })}
        </Group>
      )}
    </div>
  );
}
