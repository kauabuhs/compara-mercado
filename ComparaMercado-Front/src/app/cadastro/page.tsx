import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-next";
import { AuthCard } from "@/modules/auth/components/auth-card";
import { SignupForm } from "@/modules/auth/components/signup-form";
import { getSessionUser } from "@/server/session";

// Telas de acesso não entram em buscadores
export const metadata: Metadata = { title: "Criar conta", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic"; // depende da sessão

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawNext = (await searchParams)["next"];
  const next = safeNextPath(Array.isArray(rawNext) ? rawNext[0] : rawNext);
  if (await getSessionUser()) redirect(next);

  const signInHref = next === "/conta" ? "/entrar" : `/entrar?next=${encodeURIComponent(next)}`;
  return (
    <AuthCard
      title="Criar conta"
      description="Consultar preços e montar listas não exige conta. Crie a sua para enviar preços e ajudar a cidade a economizar."
      footer={
        <p>
          Já tem conta?{" "}
          <Link href={signInHref} className="font-medium text-brand hover:underline">
            Entrar
          </Link>
        </p>
      }
    >
      <SignupForm next={next} />
    </AuthCard>
  );
}
