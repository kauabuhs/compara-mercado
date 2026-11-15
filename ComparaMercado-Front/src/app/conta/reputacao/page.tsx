import type { ReputationEventKind } from "@contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LevelBadge, levelLabel } from "@/components/shared/level-badge";
import { Section } from "@/components/ui/controls";
import { Card, EmptyState, Group, GroupRow, PageHeader } from "@/components/ui/primitives";
import { formatTimeAgo } from "@/lib/format";
import { getAccessToken } from "@/server/session";
import { getMyReputation } from "@/services/api/endpoints";

export const metadata: Metadata = { title: "Minha reputação" };
export const dynamic = "force-dynamic"; // dado pessoal: nunca em cache

const EVENT_LABEL: Record<ReputationEventKind, string> = {
  price_approved: "Seu preço foi confirmado",
  price_rejected: "Um preço seu não foi aprovado",
  confirmation_received: "Alguém confirmou o seu preço",
  confirmation_given: "Você confirmou o preço de alguém",
};

// Texto de apoio: as regras e os pontos valem no banco (ADR-0010); se mudarem lá, mude aqui.
const HOW_TO_EARN = [
  "+10 quando um preço seu é confirmado",
  "+2 cada vez que alguém confirma um preço seu",
  "+1 por confirmar o preço de outra pessoa (até 20 por dia)",
  "−20 quando um preço seu é rejeitado",
];

export default async function ReputationPage() {
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/entrar?next=/conta/reputacao");

  const reputation = await getMyReputation(accessToken);
  const now = Date.now();
  const toNext =
    reputation.nextLevelAt === null ? null : reputation.nextLevelAt - reputation.points;
  const progress =
    reputation.nextLevelAt === null
      ? 100
      : Math.min(100, Math.round((reputation.points / reputation.nextLevelAt) * 100));

  return (
    <div className="mx-auto w-full max-w-xl space-y-8">
      <PageHeader
        title="Minha reputação"
        action={
          <Link
            href="/conta"
            className="inline-flex min-h-11 items-center text-brand hover:underline"
          >
            Voltar
          </Link>
        }
      />

      <Card className="space-y-4 p-5">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="type-caption">Seu nível</p>
            <p className="type-title">{levelLabel(reputation.level)}</p>
          </div>
          <p className="text-right">
            <span className="text-3xl font-semibold tabular-nums">{reputation.points}</span>
            <span className="block text-sm text-muted-foreground">pontos</span>
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="Progresso até o próximo nível"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-2 overflow-hidden rounded-full bg-fill"
        >
          <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-sm text-muted-foreground">
          {toNext === null
            ? "Você está no nível mais alto. Obrigado por manter os preços da cidade em dia!"
            : `Faltam ${toNext} pontos para o próximo nível.`}
        </p>
        {reputation.level >= 2 ? (
          <p className="text-sm">
            <LevelBadge level={reputation.level} /> Seus preços publicados já nascem confirmados,
            desde que o valor seja razoável.
          </p>
        ) : null}
      </Card>

      <Section title="Como ganhar pontos">
        <Card className="p-5">
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {HOW_TO_EARN.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>
      </Section>

      <Section title="Últimos pontos">
        {reputation.events.length === 0 ? (
          <EmptyState
            title="Ainda sem pontos"
            description="Publique um preço ou confirme o de outra pessoa na Comunidade."
            action={
              <Link href="/comunidade" className="text-brand hover:underline">
                Ir para a Comunidade
              </Link>
            }
          />
        ) : (
          <Group>
            {reputation.events.map((event) => (
              <GroupRow
                key={`${event.kind}-${event.createdAt}`}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{EVENT_LABEL[event.kind]}</span>
                  <span className="type-caption block">{formatTimeAgo(event.createdAt, now)}</span>
                </span>
                <span
                  className={
                    event.points > 0
                      ? "font-semibold tabular-nums text-success-soft-foreground"
                      : "font-semibold tabular-nums text-danger"
                  }
                >
                  {event.points > 0 ? `+${event.points}` : `−${Math.abs(event.points)}`}
                </span>
              </GroupRow>
            ))}
          </Group>
        )}
      </Section>
    </div>
  );
}
