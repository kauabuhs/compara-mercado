"use client";

import { DISPLAY_NAME_MAX } from "@contracts";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Field, Input } from "@/components/ui/primitives";
import { type AuthState, signUpWithPassword } from "@/modules/auth/actions";
import { PasswordRules } from "./password-rules";

const IDLE: AuthState = { status: "idle" };

export function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUpWithPassword, IDLE);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);

  if (state.status === "sent") {
    return (
      <div role="status" className="space-y-3 text-center">
        <MailCheck aria-hidden className="mx-auto size-10 text-brand" />
        <h2 className="type-heading">Confira o seu e-mail</h2>
        <p className="text-muted-foreground">{state.message}</p>
        <p className="type-caption">
          Não chegou? Veja a caixa de spam ou tente de novo em alguns minutos.
        </p>
      </div>
    );
  }

  const errors = state.fieldErrors ?? {};
  const formError =
    state.status === "error" && Object.keys(errors).length === 0 ? state.message : undefined;
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <Field id="displayName" label="Como quer ser chamado?" error={errors.displayName}>
        <Input
          id="displayName"
          name="displayName"
          autoComplete="nickname"
          required
          maxLength={DISPLAY_NAME_MAX}
          placeholder="Seu nome ou apelido"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          aria-invalid={errors.displayName ? true : undefined}
          aria-describedby={errors.displayName ? "displayName-erro" : undefined}
        />
      </Field>
      <Field id="email" label="E-mail" error={errors.email}>
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
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-erro" : undefined}
        />
      </Field>
      <Field id="password" label="Senha" error={errors.password}>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "password-erro password-regras" : "password-regras"}
        />
      </Field>
      <PasswordRules id="password-regras" password={password} />

      <div className="space-y-1.5">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="terms"
            required
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            aria-invalid={errors.terms ? true : undefined}
            aria-describedby={errors.terms ? "terms-erro" : undefined}
            className="mt-0.5 size-5 shrink-0 accent-brand"
          />
          <span>
            Li e aceito os{" "}
            <Link href="/termos" target="_blank" className="font-medium text-brand underline">
              Termos de Uso
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" target="_blank" className="font-medium text-brand underline">
              Política de Privacidade
            </Link>
            .
          </span>
        </label>
        {errors.terms ? (
          <p id="terms-erro" role="alert" className="text-sm text-danger">
            {errors.terms}
          </p>
        ) : null}
      </div>

      {formError ? (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="w-full" size="lg">
        {pending ? "Criando conta…" : "Criar conta"}
      </Button>
    </form>
  );
}
