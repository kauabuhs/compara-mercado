"use client";

import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, Popup } from "maplibre-gl";
import { useEffect, useRef } from "react";

export interface MapStore {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/** Mapa com MapLibre + OpenStreetMap (sem custo por carregamento). */
export function StoreMap({ stores }: { stores: readonly MapStore[] }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mapContainer = mapContainerRef.current;
    if (!mapContainer || stores.length === 0) return;

    const map = new MapLibreMap({
      container: mapContainer,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            maxzoom: 19,
            attribution: "© colaboradores do OpenStreetMap",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    const bounds = new LngLatBounds();
    for (const store of stores) {
      bounds.extend([store.lng, store.lat]);
      // textContent (nunca innerHTML): o nome vem do banco e não pode injetar HTML
      const popup = new Popup({ offset: 24 }).setText(store.name);
      new Marker({ color: "#1f7a4d" }).setLngLat([store.lng, store.lat]).setPopup(popup).addTo(map);
    }
    map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });

    return () => map.remove();
  }, [stores]);

  return (
    <section
      ref={mapContainerRef}
      aria-label="Mapa dos mercados"
      className="h-72 w-full overflow-hidden rounded-3xl border border-border md:h-96"
    />
  );
}
