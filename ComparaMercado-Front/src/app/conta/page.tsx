import type { UserRole } from "@contracts";
import {
  Camera,
  FileDown,
  LayoutDashboard,
  ListChecks,
  MapPin,
  ShieldCheck,
  UserX,
} from "lucide-react";
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
import { InfoRow } from "@/modules/account/components/info-row";
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
                    chevron
                  />
                </Link>
              </GroupRow>
              {user ? (
                <GroupRow>
                  <Link href="/conta/envios" className={rowClass}>
                    <RowContent
                      icon={<IconTile icon={ListChecks} tone="brand" />}
                      title="Meus envios"
                      description="Acompanhe a análise dos preços que você enviou"
                      chevron
                    />
                  </Link>
                </GroupRow>
              ) : null}
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
              <InfoRow
                icon={<IconTile icon={MapPin} tone="brand" />}
                title="Sua localização"
                summary="Só para calcular distâncias. Nada é guardado."
              >
                <p>
                  Usamos a sua posição para mostrar a distância até cada mercado e para ordenar do
                  mais perto ao mais longe. Ela só é pedida quando você toca em{" "}
                  <strong>Ordenar por distância</strong> ou usa a localização na comparação da
                  lista.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>
                    <strong>No mapa:</strong> a distância é calculada no seu aparelho. A posição não
                    sai dele.
                  </li>
                  <li>
                    <strong>Na comparação da lista:</strong> a posição vai junto da consulta para
                    calcular a distância dos mercados, é descartada logo em seguida e nunca é
                    gravada.
                  </li>
                  <li>Não há histórico de onde você esteve.</li>
                </ul>
                <p className="text-muted-foreground">
                  Você pode recusar ou desligar a permissão nas configurações do navegador, e tudo
                  continua funcionando sem ela, só sem as distâncias.
                </p>
              </InfoRow>

              <InfoRow
                icon={<IconTile icon={ShieldCheck} tone="neutral" />}
                title="Dados que guardamos"
                summary={
                  user ? "Apenas o seu e-mail, para o acesso." : "Nenhum: você não está logado."
                }
              >
                {user ? (
                  <>
                    <p>
                      Guardamos apenas o seu <strong>e-mail</strong>, usado para o acesso sem senha:
                      mandamos um link e é ele que abre a sua sessão.
                    </p>
                    <ul className="list-disc space-y-2 pl-5">
                      <li>
                        Sua <strong>lista de compras</strong> fica só neste aparelho, não vai para
                        os nossos servidores.
                      </li>
                      <li>
                        Sua <strong>localização</strong> nunca é gravada.
                      </li>
                      <li>
                        Os preços que você enviar ficam associados à sua conta para evitar abuso,
                        mas nunca aparecem para outras pessoas.
                      </li>
                    </ul>
                  </>
                ) : (
                  <>
                    <p>
                      Você não está logado, então não guardamos <strong>nenhum dado seu</strong>.
                      Consultar preços e montar listas não exige conta.
                    </p>
                    <ul className="list-disc space-y-2 pl-5">
                      <li>
                        Sua <strong>lista de compras</strong> fica só neste aparelho.
                      </li>
                      <li>
                        Sua <strong>localização</strong> nunca é gravada.
                      </li>
                    </ul>
                    <p className="text-muted-foreground">
                      Se um dia você entrar para contribuir, guardaremos apenas o seu e-mail, para o
                      acesso.
                    </p>
                  </>
                )}
              </InfoRow>

              {user ? (
                <>
                  <InfoRow
                    icon={<IconTile icon={FileDown} tone="neutral" />}
                    title="Exportar meus dados"
                    trailing={<Badge>em breve</Badge>}
                  >
                    <p>
                      Você poderá baixar uma cópia de tudo o que guardamos sobre você (hoje, o seu
                      e-mail e as contribuições que enviou).
                    </p>
                    <p className="text-muted-foreground">
                      Esse recurso chega antes do beta fechado. Até lá, escreva para o contato da
                      política de privacidade e enviamos a cópia.
                    </p>
                  </InfoRow>
                  <InfoRow
                    icon={<IconTile icon={UserX} tone="neutral" />}
                    title="Excluir minha conta"
                    trailing={<Badge>em breve</Badge>}
                  >
                    <p>
                      Você poderá apagar a sua conta e os dados ligados a ela, sem precisar pedir a
                      ninguém.
                    </p>
                    <p className="text-muted-foreground">
                      Esse recurso chega antes do beta fechado. Até lá, escreva para o contato da
                      política de privacidade e fazemos a exclusão por você.
                    </p>
                  </InfoRow>
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
