import type { UserRole } from "@contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Section } from "@/components/ui/controls";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import { ProfileForm } from "@/modules/account/components/profile-form";
import { NewPasswordForm } from "@/modules/auth/components/new-password-form";
import { getAccessToken, getSessionUser } from "@/server/session";
import { ApiRequestError } from "@/services/api/client";
import { getCity, getMyProfile, listCities } from "@/services/api/endpoints";

export const metadata: Metadata = { title: "Meu perfil" };
export const dynamic = "force-dynamic"; // dado pessoal: nunca em cache

const ROLE_LABEL: Record<UserRole, string> = {
  user: "Conta pessoal",
  contributor: "Colaborador",
  admin: "Administrador",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "long",
  timeZone: "America/Sao_Paulo",
});

export default async function ProfilePage() {
  const [user, accessToken] = await Promise.all([getSessionUser(), getAccessToken()]);
  if (!user || !accessToken) redirect("/entrar?next=/conta/perfil");

  const [profileResult, coveredCities] = await Promise.all([
    getMyProfile(accessToken).catch((error: unknown) => {
      if (error instanceof ApiRequestError && error.code === "profile_not_found") return null;
      throw error;
    }),
    listCities(),
  ]);
  if (!profileResult) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4">
        <PageHeader title="Meu perfil" />
        <Card>
          <p>
            Não encontramos os dados do seu perfil. Saia da conta e entre de novo; se continuar,
            fale com o suporte.
          </p>
          <Link
            href="/conta"
            className="mt-3 inline-flex min-h-11 items-center text-brand hover:underline"
          >
            Voltar para a conta
          </Link>
        </Card>
      </div>
    );
  }
  const profile = profileResult;
  // A cidade do perfil pode ser uma que ainda não tem mercados ("em breve"): ela precisa estar
  // entre as opções, senão o formulário a mostraria vazia e salvar apagaria a escolha.
  const profileCity =
    profile.cityId && !coveredCities.some((city) => city.id === profile.cityId)
      ? await getCity(profile.cityId)
      : null;
  const cities = profileCity ? [...coveredCities, profileCity] : coveredCities;

  return (
    <div className="mx-auto w-full max-w-xl space-y-8">
      <PageHeader
        title="Meu perfil"
        action={
          <Link
            href="/conta"
            className="inline-flex min-h-11 items-center text-brand hover:underline"
          >
            Voltar
          </Link>
        }
      />

      <Section title="Seus dados">
        <Card className="p-5">
          <ProfileForm
            email={profile.email}
            displayName={profile.displayName}
            phone={profile.phone}
            publicNickname={profile.publicNickname}
            cityId={profile.cityId}
            cities={cities}
          />
        </Card>
      </Section>

      <Section title="Senha" footer="Ao trocar a senha, as outras sessões abertas são encerradas.">
        <Card className="p-5">
          <NewPasswordForm submitLabel="Trocar senha" />
        </Card>
      </Section>

      <Section title="Sobre a sua conta">
        <Card className="space-y-3 p-5 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Tipo de conta</span>
            <Badge tone={user.role === "admin" ? "info" : "brand"}>{ROLE_LABEL[user.role]}</Badge>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Conta criada em</span>
            <span>{dateFormatter.format(new Date(profile.createdAt))}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Termos aceitos</span>
            <span>
              {profile.termsAcceptedAt
                ? `${dateFormatter.format(new Date(profile.termsAcceptedAt))} (versão ${profile.termsVersion})`
                : "Não registrado"}
            </span>
          </div>
          <p className="type-caption pt-1">
            Leia os{" "}
            <Link href="/termos" className="text-brand underline">
              Termos de Uso
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" className="text-brand underline">
              Política de Privacidade
            </Link>
            .
          </p>
        </Card>
      </Section>
    </div>
  );
}
