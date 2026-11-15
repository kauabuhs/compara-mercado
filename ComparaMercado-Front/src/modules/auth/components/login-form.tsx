"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Field, Input } from "@/components/ui/primitives";
import { type AuthState, signInWithEmail, signInWithPassword } from "@/modules/auth/actions";

const IDLE: AuthState = { status: "idle" };

/** Entrar com e-mail e senha; o link de acesso por e-mail fica como alternativa (sem senha). */
export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"password" | "link">("password");
  return mode === "password" ? (
    <PasswordLogin next={next} onUseLink={() => setMode("link")} />
  ) : (
    <LinkLogin next={next} onUsePassword={() => setMode("password")} />
  );
}

function PasswordLogin({ next, onUseLink }: { next: string; onUseLink: () => void }) {
  const [state, action, pending] = useActionState(signInWithPassword, IDLE);
  const [email, setEmail] = useState("");
  const formError = state.status === "error" && !state.fieldErrors ? state.message : undefined;
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <Field id="email" label="E-mail" error={state.fieldErrors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="voce@exemplo.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={state.fieldErrors?.email ? true : undefined}
          aria-describedby={state.fieldErrors?.email ? "email-erro" : undefined}
        />
      </Field>
      <Field id="password" label="Senha" error={state.fieldErrors?.password}>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          aria-invalid={state.fieldErrors?.password ? true : undefined}
          aria-describedby={state.fieldErrors?.password ? "password-erro" : undefined}
        />
      </Field>
      <div className="flex justify-end">
        <Link
          href="/recuperar-senha"
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
        >
          Esqueci a senha
        </Link>
      </div>
      {formError ? (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="w-full" size="lg">
        {pending ? "Entrando…" : "Entrar"}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onUseLink}>
        Prefiro receber um link por e-mail
      </Button>
    </form>
  );
}

function LinkLogin({ next, onUsePassword }: { next: string; onUsePassword: () => void }) {
  const [state, action, pending] = useActionState(signInWithEmail, IDLE);
  const [email, setEmail] = useState("");
  const hasError = state.status === "error";
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <Field id="link-email" label="E-mail" error={state.fieldErrors?.email}>
        <Input
          id="link-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="voce@exemplo.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={state.fieldErrors?.email ? true : undefined}
          aria-describedby={state.fieldErrors?.email ? "link-email-erro" : undefined}
        />
      </Field>
      {hasError && !state.fieldErrors ? (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      ) : null}
      {state.status === "sent" ? (
        <p role="status" className="text-sm text-success-soft-foreground">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="w-full" size="lg">
        {pending ? "Enviando…" : "Receber link de acesso"}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onUsePassword}>
        Entrar com senha
      </Button>
    </form>
  );
}
