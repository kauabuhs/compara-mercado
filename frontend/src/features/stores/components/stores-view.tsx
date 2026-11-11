"use client";

import { Button, Card } from "@compara/ui";
import { Navigation } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { formatDistance } from "@/shared/lib/format";
import type { MapStore } from "./store-map";

// O mapa só carrega no navegador (MapLibre usa WebGL).
const StoreMap = dynamic(
  () => import("./store-map").then((storeMapModule) => storeMapModule.StoreMap),
  {
    ssr: false,
    loading: () => (
      <div aria-hidden className="h-72 animate-pulse rounded-3xl bg-surface-muted md:h-96" />
    ),
  },
);

export interface StoreRow extends MapStore {
  neighborhood: string | null;
  address: string | null;
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

interface Coordinates {
  lat: number;
  lng: number;
}

export function StoresView({ stores }: { stores: StoreRow[] }) {
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const storesWithDistance = useMemo(() => {
    const withDistance = stores.map((store) => ({
      ...store,
      meters: userLocation ? haversineMeters(userLocation, store) : null,
    }));
    return userLocation
      ? withDistance.sort((a, b) => (a.meters ?? 0) - (b.meters ?? 0))
      : withDistance;
  }, [stores, userLocation]);

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
    <div className="space-y-6">
      <StoreMap stores={stores} />
      <div className="space-y-2">
        <Button variant="outline" onClick={requestUserLocation}>
          <Navigation aria-hidden className="size-4" />
          {userLocation ? "Atualizar minha posição" : "Ordenar por distância"}
        </Button>
        <p className="text-sm text-muted-foreground">
          Usamos sua posição só para calcular a distância, aqui no seu aparelho. Nada é guardado.
        </p>
        {geoError ? (
          <p role="status" className="text-sm text-danger">
            {geoError}
          </p>
        ) : null}
      </div>
      <ul className="space-y-3">
        {storesWithDistance.map((store) => (
          <li key={store.id}>
            <Card className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="font-medium">{store.name}</p>
                <p className="text-sm text-muted-foreground">
                  {[store.neighborhood, store.address].filter(Boolean).join(" · ")}
                </p>
              </div>
              {store.meters !== null ? (
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatDistance(store.meters)}
                </span>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
