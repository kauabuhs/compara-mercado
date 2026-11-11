import { Button, Card } from "@compara/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/features/auth/actions";
import { LoginForm } from "@/features/auth/components/login-form";
import { ThemeToggle } from "@/shared/components/theme-toggle";
import { getSessionUser } from "@/shared/server/session";

export const metadata: Metadata = { title: "Conta" };
export const dynamic = "force-dynamic"; // depende da sessão

export default async function AccountPage() {
  const user = await getSessionUser();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Conta</h1>

      {user ? (
        <Card className="space-y-4 p-5">
          <div>
            <p className="font-medium">{user.displayName ?? "Olá!"}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {user.role === "admin" ? (
              <Button asChild variant="secondary">
                <Link href="/admin">Painel interno</Link>
              </Button>
            ) : null}
            <form action={signOut}>
              <Button type="submit" variant="outline">
                Sair
              </Button>
            </form>
          </div>
        </Card>
      ) : (
        <Card className="space-y-3 p-5">
          <h2 className="text-lg font-semibold">Entrar para contribuir</h2>
          <p className="text-muted-foreground">
            Você não precisa de conta para consultar preços. Entre só se quiser enviar preços.
            Usamos apenas o seu e-mail.
          </p>
          <LoginForm />
        </Card>
      )}

      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-semibold">Preferências</h2>
        <ThemeToggle />
      </Card>

      <Card className="space-y-2 p-5">
        <h2 className="text-lg font-semibold">Seus dados (LGPD)</h2>
        <p className="text-muted-foreground">
          Exportar e excluir a conta chegam antes do beta fechado (Fase 4). Até lá, escreva para o
          contato da política de privacidade.
        </p>
      </Card>
    </div>
  );
}
