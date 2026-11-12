import { type NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/server/supabase/auth-client";

// Troca o código do link mágico por uma sessão (cookie httpOnly).
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const origin = request.nextUrl.origin;
  if (code) {
    const authClient = await createAuthClient();
    const { error } = await authClient.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/conta`);
  }
  // Destino fixo: nunca redireciona para URL vinda da requisição (open redirect)
  return NextResponse.redirect(`${origin}/conta?erro=link`);
}
