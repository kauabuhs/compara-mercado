import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui/notice";
import { safeNextPath } from "@/lib/safe-next";
import { AuthCard } from "@/modules/auth/components/auth-card";
import { LoginForm } from "@/modules/auth/components/login-form";
import { getSessionUser } from "@/server/session";

// Telas de acesso não entram em buscadores
export const metadata: Metadata = { title: "Entrar", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic"; // depende da sessão

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNextPath(first(params["next"]));
  if (await getSessionUser()) redirect(next);

  const signUpHref = next === "/conta" ? "/cadastro" : `/cadastro?next=${encodeURIComponent(next)}`;
  return (
    <div className="space-y-4">
      {first(params["erro"]) === "link" ? (
        <div className="mx-auto w-full max-w-md">
          <Notice tone="warning">
            Não foi possível abrir esse link neste navegador. Se era a confirmação do e-mail, ela
            pode já ter funcionado: tente entrar. Se era a recuperação de senha, peça um novo link
            neste mesmo navegador.
          </Notice>
        </div>
      ) : null}
      {next.startsWith("/admin") ? (
        <div className="mx-auto w-full max-w-md">
          <Notice>Entre com a sua conta de administrador para abrir o painel interno.</Notice>
        </div>
      ) : null}
      <AuthCard
        title="Entrar"
        description="Acesse a sua conta para enviar preços e acompanhar seus envios."
        footer={
          <p>
            Ainda não tem conta?{" "}
            <Link href={signUpHref} className="font-medium text-brand hover:underline">
              Criar conta
            </Link>
          </p>
        }
      >
        <LoginForm next={next} />
      </AuthCard>
    </div>
  );
}
