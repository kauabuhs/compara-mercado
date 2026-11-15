import type { SessionUser, UserRole } from "@contracts";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge, Card, ProductAvatar } from "@/components/ui/primitives";

const ROLE_LABEL: Record<UserRole, string> = {
  user: "Conta pessoal",
  contributor: "Colaborador",
  admin: "Administrador",
};

/** Quem está logado, numa linha tocável que leva ao perfil (o topo da tela, como nos Ajustes do iOS). */
export function AccountSummary({ user }: { user: SessionUser }) {
  const name = user.displayName ?? "Minha conta";
  return (
    <Link
      href="/conta/perfil"
      className="flex items-center gap-4 rounded-2xl bg-surface p-4 transition-colors hover:bg-surface-muted active:bg-fill"
    >
      <ProductAvatar
        name={user.displayName ?? user.email ?? "?"}
        className="size-14 rounded-full text-2xl"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-lg font-semibold">{name}</p>
        {user.email ? <p className="type-caption truncate">{user.email}</p> : null}
        <Badge tone={user.role === "admin" ? "info" : "brand"}>{ROLE_LABEL[user.role]}</Badge>
      </div>
      <span className="sr-only">Abrir meu perfil</span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

/** Convite para quem não entrou: o que ganha com a conta e os dois caminhos (entrar ou criar). */
export function AccountInvite() {
  return (
    <Card className="space-y-4 p-5">
      <div className="space-y-1">
        <h2 className="type-heading">Entre para contribuir</h2>
        <p className="text-muted-foreground">
          Consultar preços e montar listas não exige conta. Entre ou crie a sua só para enviar
          preços e acompanhar seus envios.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild size="lg">
          <Link href="/entrar">Entrar</Link>
        </Button>
        <Button asChild size="lg" variant="secondary">
          <Link href="/cadastro">Criar conta</Link>
        </Button>
      </div>
    </Card>
  );
}
