"use client";

import type { CommunityFeedResponse, FeedItem } from "@contracts";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/primitives";
import { loadFeedAction } from "../actions";
import { PriceReportCard } from "./price-report-card";

type Tab = "now" | "near" | "promo";

const TABS = [
  { value: "now", label: "Agora" },
  { value: "near", label: "Perto de mim" },
  { value: "promo", label: "Promoções" },
] as const;

/** "Perto de mim" olha num raio de 5 km em torno do aparelho. */
const NEAR_RADIUS_M = 5_000;
/** Ao voltar para a aba depois disso, busca publicações novas em segundo plano. */
const RECHECK_AFTER_MS = 60_000;

const EMPTY_TEXT: Record<Tab, { title: string; description: string }> = {
  now: {
    title: "Ninguém publicou ainda",
    description: "Seja a primeira pessoa a publicar um preço na sua cidade.",
  },
  near: {
    title: "Nada por perto",
    description: "Não há publicações recentes num raio de 5 km. Veja a aba Agora.",
  },
  promo: {
    title: "Nenhuma promoção agora",
    description: "Quando alguém publicar uma promoção, ela aparece aqui.",
  },
};

interface CommunityFeedProps {
  cityId: string;
  initial: CommunityFeedResponse;
  signedIn: boolean;
}

/**
 * Lista da comunidade com três abas (Agora · Perto de mim · Promoções), "carregar mais" por cursor
 * e atualização ao voltar para a aba. A primeira página chega do servidor; o resto vem por Server
 * Action. A posição do aparelho só é pedida em "Perto de mim", fica em memória e nunca vai à URL.
 */
export function CommunityFeed({ cityId, initial, signedIn }: CommunityFeedProps) {
  const [tab, setTab] = useState<Tab>("now");
  const [items, setItems] = useState<FeedItem[]>(initial.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [hasFresh, setHasFresh] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  const position = useRef<{ lat: number; lng: number } | null>(null);
  const lastLoadedAt = useRef(Date.now());

  const request = useCallback(
    (forTab: Tab, cursor?: string) => ({
      cityId,
      promoOnly: forTab === "promo",
      ...(cursor ? { cursor } : {}),
      ...(forTab === "near" && position.current
        ? { where: { ...position.current, radiusM: NEAR_RADIUS_M } }
        : {}),
    }),
    [cityId],
  );

  function load(forTab: Tab) {
    setMessage(null);
    setHasFresh(false);
    startTransition(async () => {
      const result = await loadFeedAction(request(forTab));
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setItems(result.items);
      setNextCursor(result.nextCursor);
      setNow(Date.now());
      lastLoadedAt.current = Date.now();
    });
  }

  function changeTab(next: Tab) {
    if (next === tab) return;
    if (next !== "near") {
      setTab(next);
      load(next);
      return;
    }
    if (!("geolocation" in navigator)) {
      setMessage("Este aparelho não informa a localização.");
      return;
    }
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        position.current = { lat: coords.latitude, lng: coords.longitude };
        setTab("near");
        load("near");
      },
      () => setMessage("Sem a localização não dá para mostrar o que está perto. Veja a aba Agora."),
      { maximumAge: 300_000, timeout: 8_000 },
    );
  }

  function loadMore() {
    if (!nextCursor) return;
    setMessage(null);
    startTransition(async () => {
      const result = await loadFeedAction(request(tab, nextCursor));
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...result.items.filter((item) => !seen.has(item.id))];
      });
      setNextCursor(result.nextCursor);
    });
  }

  // Ao voltar para a aba depois de um tempo, procura publicações novas sem mexer na lista atual:
  // se houver, oferece "Ver novas publicações" (a lista não pula sob o dedo de quem está lendo).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLoadedAt.current < RECHECK_AFTER_MS) return;
      lastLoadedAt.current = Date.now();
      void loadFeedAction(request(tab)).then((result) => {
        if (result.ok && result.items[0] && result.items[0].id !== items[0]?.id) setHasFresh(true);
      });
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [request, tab, items]);

  function showFresh() {
    window.scrollTo({ top: 0, behavior: "smooth" });
    load(tab);
  }

  return (
    <div className="space-y-4">
      <SegmentedControl label="Filtro do feed" value={tab} options={TABS} onChange={changeTab} />

      <div className="flex items-center justify-between gap-3">
        {hasFresh ? (
          <Button size="sm" onClick={showFresh}>
            Ver novas publicações
          </Button>
        ) : (
          <span aria-hidden />
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => load(tab)}
          disabled={pending}
          aria-label="Atualizar publicações"
        >
          <RefreshCw aria-hidden className={pending ? "size-4 animate-spin" : "size-4"} />
          Atualizar
        </Button>
      </div>

      {message ? (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}

      <div aria-busy={pending} className={pending ? "space-y-3 opacity-60" : "space-y-3"}>
        {items.length === 0 ? (
          <EmptyState {...EMPTY_TEXT[tab]} />
        ) : (
          items.map((item) => (
            <PriceReportCard key={item.id} item={item} signedIn={signedIn} now={now} />
          ))
        )}
      </div>

      {nextCursor ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} loading={pending}>
            Carregar mais
          </Button>
        </div>
      ) : null}
    </div>
  );
}
