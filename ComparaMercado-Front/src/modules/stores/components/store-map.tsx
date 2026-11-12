"use client";

import { Maximize, Minus, Plus } from "lucide-react";
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  setWorkerUrl,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface MapStore {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface MapPoint {
  lat: number;
  lng: number;
}

// O MapLibre resolve o worker relativo ao chunk empacotado (/_next/static/chunks/), onde o arquivo
// não existe: 404 e "Worker failed to load". O bundler emite o worker como asset e passamos a URL.
setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

// Mapa vetorial do OpenFreeMap (dados do OpenStreetMap): nítido em qualquer zoom, gratuito para
// uso comercial e sem chave. O estilo "positron" é limpo e neutro; o modo escuro é feito por CSS.
const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const DEFAULT_CENTER: [number, number] = [-51.18, -29.17];

const COOPERATIVE_GESTURE_HINTS = {
  "CooperativeGesturesHandler.WindowsHelpText": "Use Ctrl + rolagem para aproximar o mapa",
  "CooperativeGesturesHandler.MacHelpText": "Use ⌘ + rolagem para aproximar o mapa",
  "CooperativeGesturesHandler.MobileHelpText": "Use dois dedos para mover o mapa",
};

// Ícone "loja" (lucide) montado via DOM: nada de innerHTML.
const STORE_ICON_PATHS = [
  "m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7",
  "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8",
  "M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4",
  "M2 7h20",
  "M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7",
];

function createStoreIcon(): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const pathData of STORE_ICON_PATHS) {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", pathData);
    svg.append(path);
  }
  return svg;
}

/** Pino de mercado: um botão de verdade (teclado e leitor de tela), alvo de toque de 44 px. */
function createStorePin(name: string, onSelect: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "store-pin";
  // textContent/atributos (nunca innerHTML): o nome vem do banco e não pode injetar HTML
  button.setAttribute("aria-label", name);
  button.setAttribute("aria-pressed", "false");
  const body = document.createElement("span");
  body.className = "store-pin__body";
  body.append(createStoreIcon());
  button.append(body);
  button.addEventListener("click", onSelect);
  return button;
}

function createUserDot(): HTMLDivElement {
  const dot = document.createElement("div");
  dot.className = "user-dot";
  dot.setAttribute("role", "img");
  dot.setAttribute("aria-label", "Você está aqui");
  return dot;
}

const NEARBY_KM = 100;

function distanceKm(a: MapPoint, b: MapPoint): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(b.lat - a.lat);
  const longitudeDelta = toRadians(b.lng - a.lng);
  const term =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(term));
}

/**
 * Mercados que valem o enquadramento: os perto do usuário (se há posição) ou o maior grupo de
 * mercados próximos entre si. Assim, uma loja isolada em outra cidade não "afasta" o mapa.
 */
function pickFocusStores(stores: readonly MapStore[], user: MapPoint | null): MapStore[] {
  if (user) {
    const nearUser = stores.filter((store) => distanceKm(user, store) <= NEARBY_KM);
    if (nearUser.length > 0) return nearUser;
  }
  let best: MapStore[] = [];
  for (const center of stores) {
    const group = stores.filter((store) => distanceKm(center, store) <= NEARBY_KM);
    if (group.length > best.length) best = group;
  }
  return best.length > 0 ? best : [...stores];
}

interface StoreMapProps {
  stores: readonly MapStore[];
  selectedId: string | null;
  onSelect: (storeId: string | null) => void;
  userLocation: MapPoint | null;
  className?: string;
}

type MapStatus = "loading" | "ready" | "error";

/** Mapa dos mercados: pinos, seleção sincronizada com a lista e a posição do usuário (opcional). */
export function StoreMap({ stores, selectedId, onSelect, userLocation, className }: StoreMapProps) {
  const containerRef = useRef<HTMLElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pinsRef = useRef(new Map<string, { marker: Marker; button: HTMLButtonElement }>());
  const userMarkerRef = useRef<Marker | null>(null);
  const hasLoadedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const storesRef = useRef(stores);
  const userLocationRef = useRef(userLocation);
  const previousSelectedIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<MapStatus>("loading");

  useEffect(() => {
    onSelectRef.current = onSelect;
    storesRef.current = stores;
    userLocationRef.current = userLocation;
  });

  /** Enquadra os mercados (e a posição do usuário, se houver), deixando folga para controles e cartão. */
  function fitToContent(animate: boolean) {
    const map = mapRef.current;
    if (!map) return;
    const user = userLocationRef.current;
    const points: Array<[number, number]> = pickFocusStores(storesRef.current, user).map(
      (store) => [store.lng, store.lat],
    );
    if (user) points.push([user.lng, user.lat]);
    if (points.length === 0) return;
    if (points.length === 1 && points[0]) {
      map.easeTo({ center: points[0], zoom: 14, duration: animate ? 600 : 0 });
      return;
    }
    const bounds = new LngLatBounds();
    for (const point of points) bounds.extend(point);
    map.fitBounds(bounds, {
      padding: { top: 64, bottom: 72, left: 48, right: 72 },
      maxZoom: 15,
      duration: animate ? 600 : 0,
    });
  }

  // Cria o mapa uma única vez.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const hasTouchScreen = window.matchMedia("(pointer: coarse)").matches;
    const firstStore = storesRef.current[0];
    const map = new MapLibreMap({
      container,
      style: MAP_STYLE_URL,
      center: firstStore ? [firstStore.lng, firstStore.lat] : DEFAULT_CENTER,
      zoom: 12,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      // No celular o mapa não pode "prender" a rolagem da página: arrastar com um dedo rola a página.
      cooperativeGestures: hasTouchScreen,
      locale: COOPERATIVE_GESTURE_HINTS,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new AttributionControl({ compact: true }), "top-left");
    map.on("load", () => {
      // Créditos começam recolhidos (só o "i"); abrem ao tocar.
      container
        .querySelector(".maplibregl-ctrl-attrib")
        ?.classList.remove("maplibregl-compact-show");
      container.querySelector(".maplibregl-ctrl-attrib")?.removeAttribute("open");
      hasLoadedRef.current = true;
      setStatus("ready");
    });
    // Falha ao carregar o estilo (sem internet, bloqueio): avisa, a lista abaixo continua útil.
    map.on("error", () => {
      if (!hasLoadedRef.current) setStatus("error");
    });
    mapRef.current = map;

    const pins = pinsRef.current;
    return () => {
      for (const { marker } of pins.values()) marker.remove();
      pins.clear();
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      hasLoadedRef.current = false;
    };
  }, []);

  // Sincroniza os pinos com a lista (a busca na lista também filtra o mapa).
  // biome-ignore lint/correctness/useExhaustiveDependencies: fitToContent lê refs atualizadas a cada render
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const wanted = new Set(stores.map((store) => store.id));
    for (const [id, { marker }] of pinsRef.current) {
      if (!wanted.has(id)) {
        marker.remove();
        pinsRef.current.delete(id);
      }
    }
    for (const store of stores) {
      if (pinsRef.current.has(store.id)) continue;
      const button = createStorePin(store.name, () => onSelectRef.current(store.id));
      const marker = new Marker({ element: button, anchor: "bottom" })
        .setLngLat([store.lng, store.lat])
        .addTo(map);
      pinsRef.current.set(store.id, { marker, button });
    }
    fitToContent(hasLoadedRef.current);
  }, [stores]);

  // Destaca o pino selecionado e centraliza nele.
  useEffect(() => {
    for (const [id, { button }] of pinsRef.current) {
      const isSelected = id === selectedId;
      button.dataset["selected"] = String(isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
      button.style.zIndex = isSelected ? "2" : "1";
    }
    const map = mapRef.current;
    const store = stores.find((candidate) => candidate.id === selectedId);
    if (map && store && previousSelectedIdRef.current !== selectedId) {
      map.flyTo({
        center: [store.lng, store.lat],
        zoom: Math.max(map.getZoom(), 14),
        offset: [0, -48], // deixa o pino acima do cartão do mercado
        duration: 700,
      });
    }
    previousSelectedIdRef.current = selectedId;
  }, [selectedId, stores]);

  // Ponto azul da posição do usuário (a posição nunca sai do aparelho).
  // biome-ignore lint/correctness/useExhaustiveDependencies: fitToContent lê refs atualizadas a cada render
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!userLocation) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }
    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
      return;
    }
    userMarkerRef.current = new Marker({ element: createUserDot() })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map);
    fitToContent(true);
  }, [userLocation]);

  const controlClass =
    "flex size-11 items-center justify-center rounded-full transition-colors hover:bg-fill active:bg-fill-strong";

  return (
    <div className={cn("relative overflow-hidden rounded-3xl bg-fill", className)}>
      {/* O MapLibre força position:relative no contêiner; o wrapper é quem ocupa a área toda. */}
      <div className="absolute inset-0">
        <section
          ref={containerRef}
          aria-label="Mapa dos mercados"
          className="map-canvas size-full"
        />
      </div>

      {status === "loading" ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 animate-pulse bg-fill" />
      ) : null}
      {status === "error" ? (
        <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-2xl bg-surface/90 p-4 text-center text-sm text-muted-foreground">
          Não foi possível carregar o mapa agora. A lista de mercados abaixo continua disponível.
        </p>
      ) : null}

      <div className="glass-float absolute top-3 right-3 z-10 flex flex-col rounded-full p-1">
        <button
          type="button"
          aria-label="Aproximar"
          className={controlClass}
          onClick={() => mapRef.current?.zoomIn()}
        >
          <Plus aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Afastar"
          className={controlClass}
          onClick={() => mapRef.current?.zoomOut()}
        >
          <Minus aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Mostrar todos os mercados"
          className={controlClass}
          onClick={() => {
            onSelect(null);
            fitToContent(true);
          }}
        >
          <Maximize aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}
