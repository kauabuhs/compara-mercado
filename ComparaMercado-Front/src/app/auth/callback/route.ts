import { type NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "@/lib/safe-next";
import { createAuthClient } from "@/server/supabase/auth-client";

// Troca o código dos links enviados por e-mail (confirmação de cadastro, link de acesso e
// recuperação de senha) por uma sessão (cookie httpOnly) e segue para o destino pedido.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const origin = request.nextUrl.origin;
  if (code) {
    const authClient = await createAuthClient();
    const { error } = await authClient.auth.exchangeCodeForSession(code);
    if (!error) {
      // `next` vem da URL: só entra se for um caminho interno conhecido (sem open redirect).
      const next = safeNextPath(request.nextUrl.searchParams.get("next"));
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  // Destino fixo para o erro: nunca redireciona para URL vinda da requisição.
  return NextResponse.redirect(`${origin}/entrar?erro=link`);
}
