import { ChevronRight, Plus, Tag, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Fab } from "@/components/shared/fab";
import { Button } from "@/components/ui/button";
import { rowClass } from "@/components/ui/controls";
import { EmptyState, Group, GroupRow, IconTile, PageHeader } from "@/components/ui/primitives";
import { CityPicker } from "@/modules/city/components/city-picker";
import { CommunityFeed } from "@/modules/community/components/community-feed";
import { getCitySelection } from "@/server/city";
import { getAccessToken } from "@/server/session";
import { ApiUnavailableError } from "@/services/api/client";
import { getCommunityFeed } from "@/services/api/endpoints";

export const metadata: Metadata = { title: "Comunidade" };

/**
 * Preços e promoções publicados por quem mora na cidade, do mais novo ao mais antigo. Leitura
 * pública; com sessão a tela também mostra o seu voto e libera confirmar, denunciar e ver a foto.
 */
export default async function CommunityPage() {
  await connection();
  const [{ cities, selected }, accessToken] = await Promise.all([
    getCitySelection(),
    getAccessToken(),
  ]);

  const picker = <CityPicker cities={cities} selected={selected} />;

  if (!selected) {
    return (
      <div className="space-y-6">
        <PageHeader title="Comunidade" action={picker} />
        <EmptyState
          icon={<Users aria-hidden className="size-7" />}
          title="Escolha a sua cidade"
          description="Mostramos os preços e promoções publicados por quem mora perto de você."
          action={picker}
        />
      </div>
    );
  }

  // Cidade da biblioteca que ainda não tem mercados: ninguém tem o que publicar ainda.
  if (selected.coverage === "coming_soon") {
    return (
      <div className="space-y-6">
        <PageHeader title="Comunidade" action={picker} />
        <EmptyState
          icon={<Users aria-hidden className="size-7" />}
          title={`Ainda não temos mercados em ${selected.name}`}
          description="Quando o primeiro mercado da cidade for cadastrado, os preços e promoções de quem mora aí aparecem aqui."
          action={picker}
        />
      </div>
    );
  }

  let feed: Awaited<ReturnType<typeof getCommunityFeed>> | null = null;
  try {
    feed = await getCommunityFeed({
      cityId: selected.id,
      ...(accessToken ? { accessToken } : {}),
    });
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comunidade"
        description={`Preços e promoções publicados por quem mora em ${selected.name}.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {picker}
            <Button asChild className="hidden lg:inline-flex">
              <Link href="/contribuir">
                <Plus aria-hidden className="size-4" />
                Publicar preço
              </Link>
            </Button>
          </div>
        }
      />

      {feed ? (
        <CommunityFeed cityId={selected.id} initial={feed} signedIn={accessToken !== null} />
      ) : (
        <EmptyState
          title="Não foi possível carregar agora"
          description="Tente de novo em instantes."
        />
      )}

      <Group>
        <GroupRow>
          <Link href="/ofertas" className={rowClass}>
            <IconTile icon={Tag} tone="warning" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Ofertas dos encartes</span>
              <span className="type-caption block">Promoções lidas dos encartes dos mercados</span>
            </span>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </GroupRow>
      </Group>

      {/* Atalho flutuante no celular, acima da navegação (no desktop o botão fica no cabeçalho). */}
      <Fab href="/contribuir" label="Publicar" icon={Plus} />
    </div>
  );
}
