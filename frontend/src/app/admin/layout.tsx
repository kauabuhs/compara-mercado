import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/shared/server/session";

export const metadata: Metadata = {
  title: "Painel interno",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// Guarda no servidor. A RLS do banco é a segunda barreira: mesmo burlando isto, o admin não lê nem escreve nada.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (user?.role !== "admin") redirect("/conta");

  return (
    <div className="space-y-6">
      <nav
        aria-label="Painel interno"
        className="flex gap-4 border-b border-border pb-3 text-sm font-medium"
      >
        <Link href="/admin" className="hover:text-brand">
          Resumo
        </Link>
        <Link href="/admin/precos" className="hover:text-brand">
          Lançar preços
        </Link>
        <Link href="/admin/revisao" className="hover:text-brand">
          Fila de revisão
        </Link>
      </nav>
      {children}
    </div>
  );
}
