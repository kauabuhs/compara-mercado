"use client";

import { Badge, Button, Card, EmptyState, formatBRL, Skeleton } from "@compara/ui";
import { Minus, Navigation, Plus, Share2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { type CompareActionResult, compareListAction } from "@/features/shopping-list/actions";
import { listActions, useList } from "@/features/shopping-list/list-store";
import { formatDistance } from "@/shared/lib/format";

type UserLocation = { lat: number; lng: number } | null;
type ComparisonState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; comparison: Extract<CompareActionResult, { ok: true }>["data"] };

export function ListView() {
  const listItems = useList();
  const [userLocation, setUserLocation] = useState<UserLocation>(null);
  const [comparisonState, setComparisonState] = useState<ComparisonState>({ status: "idle" });
  const [geoMessage, setGeoMessage] = useState<string | null>(null);

  // Recompara sempre que a lista ou a posição mudam (com pequena espera para agrupar cliques).
  useEffect(() => {
    if (listItems.length === 0) {
      setComparisonState({ status: "idle" });
      return;
    }
    let isCancelled = false;
    setComparisonState({ status: "loading" });
    const debounceTimer = setTimeout(async () => {
      const actionResult = await compareListAction({
        items: listItems.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        ...(userLocation ? { where: userLocation } : {}),
      });
      if (isCancelled) return;
      setComparisonState(
        actionResult.ok
          ? { status: "ok", comparison: actionResult.data }
          : { status: "error", message: actionResult.error },
      );
    }, 250);
    return () => {
      isCancelled = true;
      clearTimeout(debounceTimer);
    };
  }, [listItems, userLocation]);

  const productNameById = useMemo(
    () => new Map(listItems.map((item) => [item.productId, item.name])),
    [listItems],
  );

  function requestUserLocation() {
    setGeoMessage(null);
    if (!("geolocation" in navigator)) {
      return setGeoMessage("Seu aparelho não oferece localização.");
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => setGeoMessage("Não conseguimos sua localização. A lista funciona sem ela."),
      { maximumAge: 300_000, timeout: 8000 },
    );
  }

  if (listItems.length === 0) {
    return (
      <EmptyState
        title="Sua lista está vazia"
        description="Busque um produto e toque em “Adicionar à lista”. Mostramos onde o total sai mais barato."
        action={
          <Button asChild>
            <Link href="/busca">Buscar produtos</Link>
          </Button>
        }
      />
    );
  }

  const comparison = comparisonState.status === "ok" ? comparisonState.comparison : null;
  const storesWithAllItems = comparison?.stores.filter((store) => store.complete) ?? [];
  const priciestComplete =
    storesWithAllItems.length > 1 ? storesWithAllItems[storesWithAllItems.length - 1] : undefined;
  const single = comparison?.bestSingle;
  const split = comparison?.bestSplit;
  const storeNameById = (storeId: string) =>
    comparison?.stores.find((store) => store.storeId === storeId)?.name ?? "Mercado";

  const shareText = single
    ? `Minha lista sai por ${formatBRL(single.totalCents)} no ${single.name}${
        split
          ? ` (ou ${formatBRL(split.totalCents)} dividindo entre ${split.storeIds.map(storeNameById).join(" e ")})`
          : ""
      }. Itens: ${listItems.map((item) => `${item.quantity}x ${item.name}`).join(", ")}.`
    : "";

  return (
    <div className="space-y-8">
      <section aria-labelledby="itens" className="space-y-3">
        <h2 id="itens" className="text-xl font-semibold">
          Itens ({listItems.length})
        </h2>
        <ul className="space-y-2">
          {listItems.map((item) => (
            <li key={item.productId}>
              <Card className="flex items-center justify-between gap-3 p-3 pl-4">
                <Link
                  href={`/produto/${item.productId}`}
                  className="min-w-0 flex-1 truncate font-medium"
                >
                  {item.name}
                </Link>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Diminuir quantidade de ${item.name}`}
                    onClick={() => listActions.setQuantity(item.productId, item.quantity - 1)}
                  >
                    <Minus aria-hidden className="size-4" />
                  </Button>
                  <span className="w-7 text-center font-semibold tabular-nums">
                    <span className="sr-only">Quantidade: </span>
                    {item.quantity}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Aumentar quantidade de ${item.name}`}
                    onClick={() => listActions.setQuantity(item.productId, item.quantity + 1)}
                  >
                    <Plus aria-hidden className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover ${item.name}`}
                    onClick={() => listActions.remove(item.productId)}
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={requestUserLocation}>
            <Navigation aria-hidden className="size-4" />{" "}
            {userLocation ? "Posição ativa" : "Considerar distância"}
          </Button>
          <Button variant="ghost" onClick={() => listActions.clear()}>
            Limpar lista
          </Button>
        </div>
        {geoMessage ? (
          <p role="status" className="text-sm text-danger">
            {geoMessage}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="resultado" aria-live="polite" className="space-y-4">
        <h2 id="resultado" className="text-xl font-semibold">
          Quanto custa
        </h2>

        {comparisonState.status === "loading" ? (
          <div className="space-y-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-20" />
          </div>
        ) : null}

        {comparisonState.status === "error" ? (
          <Card className="border-danger/40 bg-danger-soft p-4 text-danger" role="alert">
            {comparisonState.message}
          </Card>
        ) : null}

        {comparison && !single ? (
          <EmptyState
            title="Nenhum mercado tem esses itens"
            description="Tente trocar por produtos parecidos."
          />
        ) : null}

        {single ? (
          <Card className="space-y-2 border-brand/40 p-5">
            <Badge tone="brand">melhor mercado único</Badge>
            <p className="text-lg font-medium">{single.name}</p>
            <p className="text-4xl font-semibold tabular-nums tracking-tight">
              {formatBRL(single.totalCents)}
            </p>
            <p className="text-sm text-muted-foreground">
              {single.complete
                ? "Tem todos os itens"
                : `Faltam ${single.missingProductIds.length} item(ns): ${single.missingProductIds.map((productId) => productNameById.get(productId) ?? "item").join(", ")}`}
              {single.distanceMeters !== null ? ` · ${formatDistance(single.distanceMeters)}` : ""}
            </p>
            {priciestComplete && priciestComplete.storeId !== single.storeId ? (
              <p className="font-medium text-brand">
                Economiza {formatBRL(priciestComplete.totalCents - single.totalCents)} em relação ao
                mais caro ({priciestComplete.name}).
              </p>
            ) : null}
          </Card>
        ) : null}

        {split ? (
          <Card className="space-y-3 p-5">
            <Badge tone="warning">dividindo entre dois mercados</Badge>
            <p className="text-lg font-medium">{split.storeIds.map(storeNameById).join(" + ")}</p>
            <p className="text-3xl font-semibold tabular-nums tracking-tight">
              {formatBRL(split.totalCents)}
            </p>
            <p className="font-medium text-brand">
              Economiza mais {formatBRL(split.savingsCents)}
              {split.extraDistanceMeters !== null
                ? `, com ${formatDistance(split.extraDistanceMeters)} a mais de deslocamento`
                : ""}
              .
            </p>
            <ul className="space-y-1 text-sm">
              {split.assignments.map((assignment) => (
                <li key={assignment.productId} className="flex justify-between gap-3">
                  <span className="truncate">
                    {assignment.quantity}× {productNameById.get(assignment.productId) ?? "item"}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {storeNameById(assignment.storeId)} ·{" "}
                    {formatBRL(assignment.priceCents * assignment.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {comparison?.stores.some((store) => store.foundCount > 0) ? (
          <div className="space-y-2">
            <h3 className="font-semibold">Total em cada mercado</h3>
            <ol className="space-y-2">
              {comparison.stores
                .filter((store) => store.foundCount > 0)
                .map((store) => (
                  <li key={store.storeId}>
                    <Card className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{store.name}</p>
                        {!store.complete ? (
                          <p className="text-sm text-muted-foreground">
                            sem {store.missingProductIds.length} item(ns)
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-lg font-semibold tabular-nums">
                        {formatBRL(store.totalCents)}
                      </span>
                    </Card>
                  </li>
                ))}
            </ol>
          </div>
        ) : null}

        {shareText ? (
          <Button asChild variant="secondary">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Share2 aria-hidden className="size-4" /> Compartilhar no WhatsApp
            </a>
          </Button>
        ) : null}
      </section>
    </div>
  );
}
