"use server";

import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN } from "@contracts";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TERMS_VERSION } from "@/lib/legal";
import { passwordProblem } from "@/lib/password";
import { RateLimiter } from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/safe-next";
import { env } from "@/server/env";
import { getClientIp } from "@/server/request";
import { createAuthClient } from "@/server/supabase/auth-client";

// Camada fina sobre o Supabase Auth (a sessão fica no Next: o PKCE exige que o mesmo servidor que
// iniciou o fluxo troque o código). Regras de segurança que valem para todas as ações:
//  - nunca revelar se um e-mail tem conta (cadastro, "esqueci a senha" e link de acesso respondem igual);
//  - login errado sempre diz "e-mail ou senha incorretos", sem apontar qual dos dois;
//  - o destino pós-login (`next`) só passa por `safeNextPath`.
// Os limites abaixo são por instância (em memória); a barreira real é a do próprio Supabase Auth.
const loginLimiter = new RateLimiter(10, 10 * 60_000);
const signUpLimiter = new RateLimiter(5, 60 * 60_000);
const emailLimiter = new RateLimiter(5, 10 * 60_000);

export interface AuthState {
  status: "idle" | "sent" | "error";
  message?: string;
  /** Erros por campo (nome do campo → mensagem), para marcar o input certo. */
  fieldErrors?: Partial<Record<"displayName" | "email" | "password" | "terms", string>>;
}

const failure = (message: string, fieldErrors?: AuthState["fieldErrors"]): AuthState => ({
  status: "error",
  message,
  ...(fieldErrors ? { fieldErrors } : {}),
});
const RATE_LIMITED = failure("Muitas tentativas. Aguarde alguns minutos e tente de novo.");
const TRY_AGAIN = failure("Não foi possível concluir agora. Tente de novo em instantes.");

const emailSchema = z.email().max(254);

function readEmail(form: FormData) {
  return emailSchema.safeParse(
    String(form.get("email") ?? "")
      .trim()
      .toLowerCase(),
  );
}

/** Endereço para onde os links dos e-mails voltam: sempre o nosso callback, com destino validado. */
function callbackUrl(next: string): string {
  const url = new URL("/auth/callback", env().NEXT_PUBLIC_SITE_URL);
  url.searchParams.set("next", next);
  return url.toString();
}

/** Código estável do erro do Supabase Auth (o texto muda entre versões; o código não). */
function authCode(error: { code?: string | undefined }): string {
  return error.code ?? "unknown";
}

// ── Entrar ─────────────────────────────────────────────────────────────────────────────────────

export async function signInWithPassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = readEmail(form);
  if (!email.success)
    return failure("Digite um e-mail válido.", { email: "Digite um e-mail válido." });
  const password = String(form.get("password") ?? "");
  if (password === "") return failure("Digite a sua senha.", { password: "Digite a sua senha." });
  const next = safeNextPath(form.get("next"));

  if (!loginLimiter.check(`${await getClientIp()}:${email.data}`).ok) return RATE_LIMITED;

  const authClient = await createAuthClient();
  const { error } = await authClient.auth.signInWithPassword({ email: email.data, password });
  if (error) {
    switch (authCode(error)) {
      case "invalid_credentials":
        return failure("E-mail ou senha incorretos.");
      case "email_not_confirmed":
        // Só chega aqui quem acertou a senha: reenviar a confirmação não vaza nada.
        await authClient.auth.resend({
          type: "signup",
          email: email.data,
          options: { emailRedirectTo: callbackUrl(next) },
        });
        return failure(
          "Seu e-mail ainda não foi confirmado. Reenviamos a mensagem: abra o link dela e entre de novo.",
        );
      case "over_request_rate_limit":
      case "over_email_send_rate_limit":
        return RATE_LIMITED;
      default:
        console.error("login com senha recusado", error.status, authCode(error));
        return TRY_AGAIN;
    }
  }
  redirect(next);
}

/** Link de acesso por e-mail (sem senha). Só para contas que já existem: o cadastro é outra tela. */
export async function signInWithEmail(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = readEmail(form);
  if (!email.success)
    return failure("Digite um e-mail válido.", { email: "Digite um e-mail válido." });
  const next = safeNextPath(form.get("next"));

  if (!emailLimiter.check(`${await getClientIp()}:${email.data}`).ok) return RATE_LIMITED;

  const authClient = await createAuthClient();
  const { error } = await authClient.auth.signInWithOtp({
    email: email.data,
    // O cadastro registra o aceite dos termos; criar conta por aqui pularia essa etapa.
    options: { shouldCreateUser: false, emailRedirectTo: callbackUrl(next) },
  });
  // E-mail sem conta (`otp_disabled`) responde igual a sucesso: não revela quem tem conta.
  if (error && authCode(error) !== "otp_disabled") {
    if (authCode(error).includes("rate_limit")) return RATE_LIMITED;
    console.error("link de acesso recusado", error.status, authCode(error));
    return TRY_AGAIN;
  }
  return {
    status: "sent",
    message: "Se existir uma conta com esse e-mail, enviamos um link de acesso para ele.",
  };
}

// ── Criar conta ────────────────────────────────────────────────────────────────────────────────

export async function signUpWithPassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const displayName = z
    .string()
    .trim()
    .min(DISPLAY_NAME_MIN)
    .max(DISPLAY_NAME_MAX)
    .safeParse(String(form.get("displayName") ?? ""));
  if (!displayName.success) {
    const message = `Como quer ser chamado? Use de ${DISPLAY_NAME_MIN} a ${DISPLAY_NAME_MAX} letras.`;
    return failure(message, { displayName: message });
  }
  const email = readEmail(form);
  if (!email.success)
    return failure("Digite um e-mail válido.", { email: "Digite um e-mail válido." });
  const password = String(form.get("password") ?? "");
  const problem = passwordProblem(password);
  if (problem) return failure(problem, { password: problem });
  if (form.get("terms") !== "on") {
    const message = "Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.";
    return failure(message, { terms: message });
  }
  const next = safeNextPath(form.get("next"));

  if (!signUpLimiter.check(await getClientIp()).ok) return RATE_LIMITED;

  const authClient = await createAuthClient();
  const { data, error } = await authClient.auth.signUp({
    email: email.data,
    password,
    options: {
      emailRedirectTo: callbackUrl(next),
      // O banco valida estes metadados (nome aparado, versão no formato AAAA-MM) e nunca lê papel deles.
      data: { display_name: displayName.data, terms_version: TERMS_VERSION },
    },
  });
  if (error) {
    switch (authCode(error)) {
      case "weak_password":
        return failure(
          "Essa senha é fraca demais. Misture letras maiúsculas, minúsculas e números.",
          {
            password: "Essa senha é fraca demais.",
          },
        );
      case "over_request_rate_limit":
      case "over_email_send_rate_limit":
        return RATE_LIMITED;
      default:
        console.error("cadastro recusado", error.status, authCode(error));
        return TRY_AGAIN;
    }
  }
  // Sem confirmação de e-mail configurada (não deveria ocorrer em produção), o cadastro já entra.
  if (data.session) redirect(next);

  // Com ou sem conta prévia, a resposta é a mesma: quem já tem conta não é exposto.
  return {
    status: "sent",
    message: `Enviamos um e-mail para ${email.data}. Abra o link dele para ativar a sua conta.`,
  };
}

// ── Senha esquecida e nova senha ───────────────────────────────────────────────────────────────

export async function requestPasswordReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = readEmail(form);
  if (!email.success)
    return failure("Digite um e-mail válido.", { email: "Digite um e-mail válido." });

  if (!emailLimiter.check(`${await getClientIp()}:${email.data}`).ok) return RATE_LIMITED;

  const authClient = await createAuthClient();
  const { error } = await authClient.auth.resetPasswordForEmail(email.data, {
    redirectTo: callbackUrl("/nova-senha"),
  });
  if (error && authCode(error).includes("rate_limit")) return RATE_LIMITED;
  if (error) console.error("recuperação de senha com falha", error.status, authCode(error));

  // Resposta idêntica com conta, sem conta ou falha interna: nunca revela quem tem conta.
  return {
    status: "sent",
    message:
      "Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha. Ele vale por pouco tempo.",
  };
}

/**
 * Define a senha da sessão atual: vale para o link de recuperação (que abre uma sessão) e para a
 * troca de senha dentro da conta. As outras sessões do usuário são encerradas, o que expulsa
 * quem estivesse com a senha antiga.
 */
export async function updatePassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  const problem = passwordProblem(password);
  if (problem) return failure(problem, { password: problem });

  const authClient = await createAuthClient();
  const { data } = await authClient.auth.getUser();
  if (!data.user) {
    return failure("O link expirou ou já foi usado. Peça um novo em “Esqueci a senha”.");
  }

  const { error } = await authClient.auth.updateUser({ password });
  if (error) {
    switch (authCode(error)) {
      case "same_password":
        return failure("Escolha uma senha diferente da atual.", {
          password: "Escolha uma senha diferente da atual.",
        });
      case "weak_password":
        return failure(
          "Essa senha é fraca demais. Misture letras maiúsculas, minúsculas e números.",
          {
            password: "Essa senha é fraca demais.",
          },
        );
      case "reauthentication_needed":
        return failure("Por segurança, saia da conta, entre de novo e tente trocar a senha.");
      default:
        console.error("troca de senha recusada", error.status, authCode(error));
        return TRY_AGAIN;
    }
  }
  await authClient.auth.signOut({ scope: "others" });
  redirect("/conta?aviso=senha-alterada");
}

export async function signOut(): Promise<void> {
  const authClient = await createAuthClient();
  await authClient.auth.signOut();
  redirect("/");
}
