import type { UserRole } from "@contracts";
import { Camera, FileDown, LayoutDashboard, MapPin, ShieldCheck, UserX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/shared/confirm-submit";
import { RowContent, rowClass, Section } from "@/components/ui/controls";
import {
  Badge,
  Card,
  Group,
  GroupRow,
  IconTile,
  PageHeader,
  ProductAvatar,
} from "@/components/ui/primitives";
import { InstallAppRow } from "@/modules/account/components/install-app-row";
import { SavedListRows } from "@/modules/account/components/saved-list-rows";
import { ThemeSelector } from "@/modules/account/components/theme-selector";
import { signOut } from "@/modules/auth/actions";
import { LoginForm } from "@/modules/auth/components/login-form";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = { title: "Conta" };
export const dynamic = "force-dynamic"; // depende da sessão

const ROLE_LABEL: Record<UserRole, string> = {
  user: "Conta pessoal",
  contributor: "Colaborador",
  admin: "Administrador",
};

const infoRowClass = "flex min-h-14 items-center gap-3 px-4 py-3";

export default async function AccountPage() {
  const user = await getSessionUser();

  return (
    <div className="space-y-8">
      <PageHeader title="Conta" />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
        <div className="space-y-8">
          {user ? (
            <Card className="flex items-center gap-4 p-5">
              <ProductAvatar
                name={user.displayName ?? user.email ?? "?"}
                className="size-16 rounded-2xl text-3xl"
              />
              <div className="min-w-0 space-y-1">
                <p className="truncate text-lg font-semibold">{user.displayName ?? "Olá!"}</p>
                {user.email ? <p className="type-caption truncate">{user.email}</p> : null}
                <Badge tone={user.role === "admin" ? "info" : "brand"}>
                  {ROLE_LABEL[user.role]}
                </Badge>
              </div>
            </Card>
          ) : (
            <Card className="space-y-4 p-5">
              <div className="space-y-1">
                <h2 className="type-heading">Entre para contribuir</h2>
                <p className="text-muted-foreground">
                  Consultar preços e montar listas não exige conta. Entre só para enviar preços. Sem
                  senha: mandamos um link para o seu e-mail.
                </p>
              </div>
              <LoginForm />
            </Card>
          )}

          <Section title="Atalhos">
            <Group>
              <SavedListRows />
              <GroupRow>
                <Link href="/contribuir" className={rowClass}>
                  <RowContent
                    icon={<IconTile icon={Camera} tone="warning" />}
                    title="Contribuir com preços"
                    description="Fotografe etiquetas e ajude a cidade a economizar"
                    trailing={<Badge>em breve</Badge>}
                    chevron
                  />
                </Link>
              </GroupRow>
              {user?.role === "admin" ? (
                <GroupRow>
                  <Link href="/admin" className={rowClass}>
                    <RowContent
                      icon={<IconTile icon={LayoutDashboard} tone="info" />}
                      title="Painel interno"
                      description="Lançar preços e revisar envios"
                      chevron
                    />
                  </Link>
                </GroupRow>
              ) : null}
            </Group>
          </Section>
        </div>

        <div className="space-y-8">
          <Section title="Aparência">
            <ThemeSelector />
          </Section>

          <InstallAppRow />

          <Section
            title="Privacidade e dados"
            footer={
              user
                ? "Exportar e excluir a conta chegam antes do beta fechado. Até lá, escreva para o contato da política de privacidade."
                : "Você controla o que compartilha: nada é enviado sem a sua ação."
            }
          >
            <Group>
              <GroupRow className={infoRowClass}>
                <RowContent
                  icon={<IconTile icon={MapPin} tone="brand" />}
                  title="Sua localização"
                  description="Usada só para calcular distâncias, no seu aparelho. Nada é guardado."
                />
              </GroupRow>
              <GroupRow className={infoRowClass}>
                <RowContent
                  icon={<IconTile icon={ShieldCheck} tone="neutral" />}
                  title="Dados que guardamos"
                  description={
                    user ? "Apenas o seu e-mail, para o acesso." : "Nenhum: você não está logado."
                  }
                />
              </GroupRow>
              {user ? (
                <>
                  <GroupRow className={`${infoRowClass} opacity-60`}>
                    <RowContent
                      icon={<IconTile icon={FileDown} tone="neutral" />}
                      title="Exportar meus dados"
                      trailing={<Badge>em breve</Badge>}
                    />
                  </GroupRow>
                  <GroupRow className={`${infoRowClass} opacity-60`}>
                    <RowContent
                      icon={<IconTile icon={UserX} tone="neutral" />}
                      title="Excluir minha conta"
                      trailing={<Badge>em breve</Badge>}
                    />
                  </GroupRow>
                </>
              ) : null}
            </Group>
          </Section>

          {user ? (
            <form action={signOut}>
              <ConfirmSubmitButton
                variant="secondary"
                size="lg"
                className="w-full text-danger"
                confirmation={{
                  variant: "sheet",
                  title: "Sair da conta?",
                  description:
                    "Você continua podendo consultar preços e usar sua lista sem entrar.",
                  confirmLabel: "Sair",
                  destructive: true,
                }}
              >
                Sair da conta
              </ConfirmSubmitButton>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
