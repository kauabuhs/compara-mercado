"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { RateLimiter } from "@/lib/rate-limit";
import { env } from "@/server/env";
import { getClientIp } from "@/server/request";
import { createAuthClient } from "@/server/supabase/auth-client";

const limiter = new RateLimiter(5, 10 * 60_000);

export type AuthState = { status: "idle" | "sent" | "error"; message?: string };

/** Login por link mágico: sem senha, só e-mail (dados mínimos, LGPD). */
export async function signInWithEmail(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = z
    .email()
    .max(254)
    .safeParse(String(form.get("email") ?? "").trim());
  if (!email.success) return { status: "error", message: "Digite um e-mail válido." };

  const clientIp = await getClientIp();
  if (!limiter.check(`${clientIp}:${email.data}`).ok) {
    return { status: "error", message: "Muitas tentativas. Aguarde alguns minutos." };
  }

  const authClient = await createAuthClient();
  const { error } = await authClient.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${env().NEXT_PUBLIC_SITE_URL}/auth/callback` },
  });
  if (error) return { status: "error", message: "Não foi possível enviar o link. Tente de novo." };
  return { status: "sent", message: "Enviamos um link de acesso para o seu e-mail." };
}

export async function signOut(): Promise<void> {
  const authClient = await createAuthClient();
  await authClient.auth.signOut();
  redirect("/");
}
