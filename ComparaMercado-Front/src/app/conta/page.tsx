import { Award, Camera, LayoutDashboard, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { Group, PageHeader } from "@/components/ui/primitives";
import { AccountInvite, AccountSummary } from "@/modules/account/components/account-summary";
import { InstallAppRow } from "@/modules/account/components/install-app-row";
import { LinkRow } from "@/modules/account/components/link-row";
import { PrivacyRow } from "@/modules/account/components/privacy-row";
import { SavedListRow } from "@/modules/account/components/saved-list-rows";
import { SignOutRow } from "@/modules/account/components/sign-out-row";
import { ThemeSelector } from "@/modules/account/components/theme-selector";
import { signOut } from "@/modules/auth/actions";
import { ListSyncNow } from "@/modules/shopping-list/components/list-sync";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = { title: "Conta" };
export const dynamic = "force-dynamic"; // depende da sessão

/** Avisos que outras telas deixam em `?aviso=` (texto fixo: nunca ecoa o valor da URL). */
const NOTICES: Record<string, { tone: "success" | "warning"; text: string }> = {
  "senha-alterada": {
    tone: "success",
    text: "Senha alterada. As outras sessões abertas foram encerradas.",
  },
  "sem-permissao": {
    tone: "warning",
    text: "Esta área é só para administradores. A sua conta não tem esse acesso.",
  },
};

/**
 * Conta, em poucas peças: quem sou eu, o que faço aqui, o app e a privacidade, sair. Dois grupos
 * sem título (como os Ajustes do iOS), uma coluna centralizada em todos os tamanhos. A aparência
 * é um controle de ícones no canto do cabeçalho: sempre à mão, sem ocupar uma seção.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams]);
  const rawNotice = params["aviso"];
  const notice = NOTICES[(Array.isArray(rawNotice) ? rawNotice[0] : rawNotice) ?? ""];

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <PageHeader title="Conta" action={<ThemeSelector />} />
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      {user ? <AccountSummary user={user} /> : <AccountInvite />}

      <Group>
        {user?.role === "admin" ? (
          <LinkRow
            href="/admin"
            icon={LayoutDashboard}
            tone="info"
            title="Painel interno"
            description="Preços e revisões"
          />
        ) : null}
        <SavedListRow />
        {/* Quem tem conta abre aqui e já recebe a lista dos outros aparelhos */}
        {user ? <ListSyncNow /> : null}
        {user ? (
          <LinkRow
            href="/conta/envios"
            icon={ListChecks}
            tone="brand"
            title="Meus envios"
            description="Acompanhe a análise"
          />
        ) : null}
        {user ? (
          <LinkRow
            href="/conta/reputacao"
            icon={Award}
            tone="brand"
            title="Minha reputação"
            description="Nível e pontos"
          />
        ) : null}
        <LinkRow
          href="/contribuir"
          icon={Camera}
          tone="brand"
          title="Contribuir com preços"
          description="Fotografe etiquetas de preço"
        />
      </Group>

      <Group>
        <InstallAppRow />
        <PrivacyRow signedIn={user !== null} />
      </Group>

      {user ? <SignOutRow action={signOut} /> : null}

      <nav
        aria-label="Documentos legais"
        className="type-caption flex flex-wrap items-center justify-center"
      >
        <Link href="/termos" className="inline-flex min-h-11 items-center px-3 hover:underline">
          Termos de Uso
        </Link>
        <Link
          href="/privacidade"
          className="inline-flex min-h-11 items-center px-3 hover:underline"
        >
          Política de Privacidade
        </Link>
      </nav>
    </div>
  );
}
