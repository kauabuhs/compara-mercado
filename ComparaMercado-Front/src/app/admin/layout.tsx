import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminNav } from "@/modules/admin/components/admin-nav";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Painel interno",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// Guarda no servidor. A RLS do banco é a segunda barreira: mesmo burlando isto, o admin não lê nem escreve nada.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  // Visitante vai entrar (e volta ao painel); logado sem o papel vê por que não passou.
  if (!user) redirect("/entrar?next=/admin");
  if (user.role !== "admin") redirect("/conta?aviso=sem-permissao");

  return (
    <div className="space-y-6">
      <AdminNav />
      {children}
    </div>
  );
}
