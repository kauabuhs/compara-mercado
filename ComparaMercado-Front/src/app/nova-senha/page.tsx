import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/modules/auth/components/auth-card";
import { NewPasswordForm } from "@/modules/auth/components/new-password-form";
import { getSessionUser } from "@/server/session";

// Telas de acesso não entram em buscadores
export const metadata: Metadata = { title: "Nova senha", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic"; // depende da sessão aberta pelo link do e-mail

// Só chega aqui quem abriu o link de recuperação (que cria uma sessão) ou já está logado.
export default async function NewPasswordPage() {
  if (!(await getSessionUser())) redirect("/recuperar-senha");
  return (
    <AuthCard
      title="Escolha a nova senha"
      description="Depois de salvar, as outras sessões abertas com a senha antiga são encerradas."
      footer={
        <Link href="/conta" className="font-medium text-brand hover:underline">
          Cancelar
        </Link>
      }
    >
      <NewPasswordForm />
    </AuthCard>
  );
}
