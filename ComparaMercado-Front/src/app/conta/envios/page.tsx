import type { ContributionStatus } from "@contracts";
import { Camera } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatBRL } from "@/lib/format";
import { PAGE_PARAM, parsePage } from "@/lib/pagination";
import { withParams } from "@/lib/search-params";
import { getAccessToken } from "@/server/session";
import { getMyContributions } from "@/services/api/endpoints";

export const metadata: Metadata = { title: "Meus envios" };
export const dynamic = "force-dynamic"; // dado do usuário: nunca em cache

const STATUS: Record<
  ContributionStatus,
  { label: string; tone: "warning" | "success" | "neutral" }
> = {
  pending: { label: "Em análise", tone: "warning" },
  approved: { label: "Publicado", tone: "success" },
  rejected: { label: "Não aprovado", tone: "neutral" },
  superseded: { label: "Substituído por um preço mais novo", tone: "neutral" },
};

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export default async function MyContributionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/entrar?next=/conta/envios");
  const page = parsePage((await searchParams)[PAGE_PARAM]);
  const result = await getMyContributions(accessToken, { page });

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <PageHeader
        title="Meus envios"
        description="Cada preço fica em análise, visível como não confirmado, até outras pessoas o confirmarem ou a equipe o aprovar."
      />
      {result.contributions.length === 0 ? (
        <EmptyState
          icon={<Camera aria-hidden className="size-8" />}
          title="Você ainda não enviou nenhum preço"
          description="Fotografe uma etiqueta no mercado e ajude a cidade a economizar."
          action={
            <Button asChild>
              <Link href="/contribuir">Enviar um preço</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {result.contributions.map((contribution) => {
            const status = STATUS[contribution.status];
            return (
              <li key={contribution.id}>
                <Card className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate font-medium">
                      {contribution.productName ?? "Produto indisponível"}
                    </p>
                    <p className="type-caption truncate">
                      {contribution.storeName ?? "Mercado indisponível"} ·{" "}
                      {dateTimeFormatter.format(new Date(contribution.createdAt))}
                    </p>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {contribution.reviewNote ? (
                      <p className="type-caption">Motivo: {contribution.reviewNote}</p>
                    ) : null}
                  </div>
                  <p className="text-xl font-semibold tabular-nums">
                    {formatBRL(contribution.priceCents)}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        hrefFor={(target) =>
          `/conta/envios${withParams("", { [PAGE_PARAM]: target === 1 ? null : target })}`
        }
        className="pt-2"
      />
    </div>
  );
}
