"use client";

import type { FeedItem, ReportReason } from "@contracts";
import { Check, Flag, Pencil } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { LevelBadge } from "@/components/shared/level-badge";
import { PriceTag } from "@/components/shared/price";
import { originNote, TrustBadge } from "@/components/shared/trust-badge";
import { Button } from "@/components/ui/button";
import { rowClass } from "@/components/ui/controls";
import { Badge, Card, Group, GroupRow, ProductAvatar } from "@/components/ui/primitives";
import { DetailSheet } from "@/components/ui/sheet";
import { formatDistance, formatSize, formatTimeAgo, formatValidUntil } from "@/lib/format";
import { cn } from "@/lib/utils";
import { reportAction, voteAction } from "../actions";

const REPORT_REASONS: ReadonlyArray<{ value: ReportReason; label: string }> = [
  { value: "wrong_price", label: "O preço está errado" },
  { value: "wrong_product", label: "O produto está errado" },
  { value: "wrong_store", label: "O mercado está errado" },
  { value: "inappropriate_photo", label: "A foto é imprópria" },
  { value: "spam", label: "É spam ou propaganda" },
  { value: "other", label: "Outro motivo" },
];

interface PriceReportCardProps {
  item: FeedItem;
  /** Há sessão: só quem está logado confirma, denuncia e vê a foto. */
  signedIn: boolean;
  /** Instante único da lista, para todos os "há X min" concordarem entre si. */
  now: number;
}

/**
 * Uma publicação do feed: produto, preço, mercado, idade, selo de confiança, autor e as ações em um
 * toque ("Ainda está assim" / "Mudou"). O estado da votação é local; a regra de quando o preço vira
 * *Confirmado* é do banco, e a resposta traz o resultado.
 */
export function PriceReportCard({ item: initial, signedIn, now }: PriceReportCardProps) {
  const [item, setItem] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  const until = formatValidUntil(item.validTo);
  const distance = formatDistance(item.distanceM);
  const note = originNote(item.origin);
  const voted = item.myVerdict !== null;

  function vote(verdict: "confirm" | "changed") {
    setMessage(null);
    startTransition(async () => {
      const result = await voteAction(item.id, verdict);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setItem((current) => ({
        ...current,
        myVerdict: verdict,
        confirmCount: result.confirmCount,
        changedCount: result.changedCount,
        trust:
          result.status === "approved" && current.trust === "unconfirmed"
            ? "confirmed"
            : current.trust,
      }));
    });
  }

  function report(reason: ReportReason) {
    setMessage(null);
    startTransition(async () => {
      const result = await reportAction(item.id, reason);
      if (result.ok) {
        setReported(true);
        setReporting(false);
      } else {
        setMessage(result.message);
        setReporting(false);
      }
    });
  }

  return (
    <Card className="animate-fade-in space-y-3 p-4">
      <div className="flex items-start gap-3">
        <ProductAvatar name={item.product.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{item.product.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {[item.product.brand, formatSize(item.product.sizeValue, item.product.sizeUnit)]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <PriceTag
          priceCents={item.priceCents}
          unitPriceCents={item.unitPriceCents}
          baseUnit={item.product.baseUnit}
          className="shrink-0"
        />
      </div>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-medium">{item.store.name}</span>
        <span className="text-muted-foreground">
          {[item.store.neighborhood, distance].filter(Boolean).join(" · ")}
        </span>
        {item.promo ? <Badge tone="danger">Promoção</Badge> : null}
        {until ? <Badge tone="brand">{until}</Badge> : null}
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <TrustBadge trust={item.trust} />
        <span className="text-xs text-muted-foreground">
          {formatTimeAgo(item.createdAt, now)}
          {note ? ` · ${note}` : ""}
        </span>
      </div>

      {item.origin === "community" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{item.isMine ? "Você" : item.author.label}</span>
          {item.author.level !== null ? <LevelBadge level={item.author.level} /> : null}
          {item.confirmCount > 0 ? (
            <span>
              {item.confirmCount === 1 ? "1 confirmação" : `${item.confirmCount} confirmações`}
            </span>
          ) : null}
          {item.changedCount > 0 ? (
            <span className="text-warning-soft-foreground">
              {item.changedCount === 1
                ? "1 aviso de mudança"
                : `${item.changedCount} avisos de mudança`}
            </span>
          ) : null}
          {item.hasPhoto && signedIn ? (
            <button
              type="button"
              onClick={() => setPhotoOpen(true)}
              className="ml-auto inline-flex min-h-11 items-center text-brand underline-offset-4 hover:underline"
            >
              Ver foto
            </button>
          ) : null}
        </div>
      ) : null}

      {item.isMine ? (
        <p className="type-caption">Esta é a sua publicação. Outras pessoas podem confirmá-la.</p>
      ) : signedIn ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={item.myVerdict === "confirm" ? "primary" : "secondary"}
            size="sm"
            disabled={pending || voted}
            aria-pressed={item.myVerdict === "confirm"}
            onClick={() => vote("confirm")}
          >
            <Check aria-hidden className="size-4" />
            {item.myVerdict === "confirm" ? "Você confirmou" : "Ainda está assim"}
          </Button>
          <Button
            variant={item.myVerdict === "changed" ? "primary" : "secondary"}
            size="sm"
            disabled={pending || voted}
            aria-pressed={item.myVerdict === "changed"}
            onClick={() => vote("changed")}
          >
            <Pencil aria-hidden className="size-4" />
            {item.myVerdict === "changed" ? "Você avisou" : "Mudou"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Denunciar publicação"
            disabled={pending || reported}
            onClick={() => setReporting(true)}
            className="ml-auto"
          >
            <Flag aria-hidden className={cn("size-4", reported && "text-muted-foreground")} />
          </Button>
        </div>
      ) : (
        <Link
          href="/entrar?next=/comunidade"
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          Entre para confirmar este preço
        </Link>
      )}

      {reported ? <p className="type-caption">Obrigado. Vamos analisar a denúncia.</p> : null}
      {message ? (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}

      <DetailSheet open={reporting} onOpenChange={setReporting} title="Denunciar publicação">
        <p className="type-caption pb-3">Por que esta publicação não deveria estar aqui?</p>
        <Group>
          {REPORT_REASONS.map((reason) => (
            <GroupRow key={reason.value}>
              <button
                type="button"
                className={rowClass}
                disabled={pending}
                onClick={() => report(reason.value)}
              >
                <span className="flex-1 font-medium">{reason.label}</span>
              </button>
            </GroupRow>
          ))}
        </Group>
      </DetailSheet>

      {item.hasPhoto && signedIn ? (
        <DetailSheet open={photoOpen} onOpenChange={setPhotoOpen} title="Foto da etiqueta">
          {photoOpen ? (
            // biome-ignore lint/performance/noImgElement: foto privada servida pelo próprio Next (route handler), sem otimização de imagem
            <img
              src={`/comunidade/foto/${item.id}`}
              alt={`Etiqueta de ${item.product.name} em ${item.store.name}`}
              className="mx-auto max-h-[60dvh] w-auto rounded-2xl bg-fill"
            />
          ) : null}
        </DetailSheet>
      ) : null}
    </Card>
  );
}
