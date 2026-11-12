"use client";

import { Minus, Navigation, Plus, Share2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  Badge,
  Card,
  EmptyState,
  Group,
  GroupRow,
  ProductAvatar,
  Skeleton,
} from "@/components/ui/primitives";
import { formatBRL, formatDistance } from "@/lib/format";
import { type CompareActionResult, compareListAction } from "@/modules/shopping-list/actions";
import { listActions, useList } from "@/stores/shopping-list.store";

type UserLocation = { lat: number; lng: number } | null;
type ConfirmTarget = { kind: "clear" } | { kind: "item"; productId: string; name: string };
type ComparisonState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; comparison: Extract<CompareActionResult, { ok: true }>["data"] };

export function ListView() {
  const listItems = useList();
  const [userLocation, setUserLocation] = useState<UserLocation>(null);
  const [comparisonState, setComparisonState] = useState<ComparisonState>({ status: "idle" });
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  // O alvo da confirmação fica guardado mesmo depois de fechar, para o texto não sumir durante a animação.
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>({ kind: "clear" });
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Voltou a conexão: tenta comparar de novo sem o usuário precisar mexer na lista.
  useEffect(() => {
    const retry = () => setRetryCount((count) => count + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);

  // Recompara sempre que a lista ou a posição mudam (com pequena espera para agrupar cliques).
  // biome-ignore lint/correctness/useExhaustiveDependencies: retryCount é o gatilho de nova tentativa ao voltar a conexão
  useEffect(() => {
    if (listItems.length === 0) {
      setComparisonState({ status: "idle" });
      return;
    }
    let isCancelled = false;
    setComparisonState({ status: "loading" });
    const debounceTimer = setTimeout(async () => {
      let nextState: ComparisonState;
      try {
        const actionResult = await compareListAction({
          items: listItems.map((item) => ({ productId: item.productId, quantity: item.quantity })),
          ...(userLocation ? { where: userLocation } : {}),
        });
        nextState = actionResult.ok
          ? { status: "ok", comparison: actionResult.data }
          : { status: "error", message: actionResult.error };
      } catch {
        // Sem rede (ou servidor fora do ar) a Server Action rejeita; sem isto o estado ficava
        // preso em "loading" para sempre. A lista está salva no aparelho, só a comparação espera.
        nextState = {
          status: "error",
          message:
            "Sem conexão. Sua lista está salva; os preços voltam assim que a internet voltar.",
        };
      }
      if (!isCancelled) setComparisonState(nextState);
    }, 250);
    return () => {
      isCancelled = true;
      clearTimeout(debounceTimer);
    };
  }, [listItems, userLocation, retryCount]);

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

  function askConfirmation(target: ConfirmTarget) {
    setConfirmTarget(target);
    setIsConfirmOpen(true);
  }

  function applyConfirmation() {
    if (confirmTarget.kind === "clear") listActions.clear();
    else listActions.remove(confirmTarget.productId);
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
        <h2 id="itens" className="type-heading">
          Itens ({listItems.length})
        </h2>
        <Group>
          {listItems.map((item) => (
            <GroupRow key={item.productId} className="flex items-center gap-3 py-2.5 pr-2 pl-4">
              <ProductAvatar name={item.name} />
              <Link
                href={`/produto/${item.productId}`}
                className="line-clamp-2 min-w-0 flex-1 break-words font-medium leading-snug"
              >
                {item.name}
              </Link>
              <div className="flex items-center rounded-full bg-fill">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Diminuir quantidade de ${item.name}`}
                  onClick={() => listActions.setQuantity(item.productId, item.quantity - 1)}
                >
                  <Minus aria-hidden className="size-4" />
                </Button>
                <span className="w-6 text-center font-semibold tabular-nums">
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
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-danger"
                aria-label={`Remover ${item.name}`}
                aria-haspopup="dialog"
                onClick={() =>
                  askConfirmation({ kind: "item", productId: item.productId, name: item.name })
                }
              >
                <Trash2 aria-hidden className="size-4" />
              </Button>
            </GroupRow>
          ))}
        </Group>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={requestUserLocation}>
            <Navigation aria-hidden className="size-4" />{" "}
            {userLocation ? "Posição ativa" : "Considerar distância"}
          </Button>
          <Button
            variant="ghost"
            className="text-danger"
            aria-haspopup="dialog"
            onClick={() => askConfirmation({ kind: "clear" })}
          >
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
        <h2 id="resultado" className="type-heading">
          Quanto custa
        </h2>

        {comparisonState.status === "loading" ? (
          <div className="space-y-3">
            <Skeleton className="h-36" />
            <Skeleton className="h-20" />
          </div>
        ) : null}

        {comparisonState.status === "error" ? (
          <Card className="bg-danger-soft p-4 text-danger" role="alert">
            {comparisonState.message}
          </Card>
        ) : null}

        {comparison && !single ? (
          <EmptyState
            title="Nenhum mercado tem esses itens"
            description="Tente trocar por produtos parecidos."
          />
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {single ? (
            <Card className="space-y-2 bg-brand p-5 text-brand-foreground">
              <Badge className="bg-brand-foreground/20 text-brand-foreground">
                melhor mercado único
              </Badge>
              <p className="text-lg font-medium">{single.name}</p>
              <p className="text-5xl font-semibold tabular-nums tracking-tight">
                {formatBRL(single.totalCents)}
              </p>
              <p className="text-sm opacity-85">
                {single.complete
                  ? "Tem todos os itens"
                  : `Faltam ${single.missingProductIds.length} item(ns): ${single.missingProductIds.map((productId) => productNameById.get(productId) ?? "item").join(", ")}`}
                {single.distanceMeters !== null
                  ? ` · ${formatDistance(single.distanceMeters)}`
                  : ""}
              </p>
              {priciestComplete && priciestComplete.storeId !== single.storeId ? (
                <p className="rounded-2xl bg-brand-foreground/15 px-3 py-2 font-medium">
                  Economiza {formatBRL(priciestComplete.totalCents - single.totalCents)} em relação
                  ao mais caro ({priciestComplete.name}).
                </p>
              ) : null}
            </Card>
          ) : null}

          {split ? (
            <Card className="space-y-3 p-5">
              <Badge tone="warning">dividindo entre dois mercados</Badge>
              <p className="text-lg font-medium">{split.storeIds.map(storeNameById).join(" + ")}</p>
              <p className="text-4xl font-semibold tabular-nums tracking-tight">
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
        </div>

        {comparison?.stores.some((store) => store.foundCount > 0) ? (
          <div className="space-y-2">
            <h3 className="type-subheading">Total em cada mercado</h3>
            <Group>
              {comparison.stores
                .filter((store) => store.foundCount > 0)
                .map((store) => (
                  <GroupRow
                    key={store.storeId}
                    className="flex items-center justify-between gap-3 px-4 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{store.name}</p>
                      {!store.complete ? (
                        <p className="type-caption">
                          sem {store.missingProductIds.length} item(ns)
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-lg font-semibold tabular-nums">
                      {formatBRL(store.totalCents)}
                    </span>
                  </GroupRow>
                ))}
            </Group>
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

      {confirmTarget.kind === "item" ? (
        <ConfirmDialog
          variant="alert"
          open={isConfirmOpen}
          onOpenChange={setIsConfirmOpen}
          title={`Remover “${confirmTarget.name}”?`}
          description="O item sai da sua lista e o total é recalculado."
          confirmLabel="Remover"
          destructive
          onConfirm={applyConfirmation}
        />
      ) : (
        <ConfirmDialog
          variant="sheet"
          open={isConfirmOpen}
          onOpenChange={setIsConfirmOpen}
          title="Limpar a lista inteira?"
          description={`${listItems.length} ${listItems.length === 1 ? "item será removido" : "itens serão removidos"}. Isso não pode ser desfeito.`}
          confirmLabel="Limpar lista"
          destructive
          onConfirm={applyConfirmation}
        />
      )}
    </div>
  );
}
