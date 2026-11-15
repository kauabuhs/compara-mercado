"use client";

import { MailCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { type AuthState, requestPasswordReset } from "@/modules/auth/actions";

const IDLE: AuthState = { status: "idle" };

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, IDLE);
  const [email, setEmail] = useState("");

  if (state.status === "sent") {
    return (
      <div role="status" className="space-y-3 text-center">
        <MailCheck aria-hidden className="mx-auto size-10 text-brand" />
        <h2 className="type-heading">Confira o seu e-mail</h2>
        <p className="text-muted-foreground">{state.message}</p>
        <p className="type-caption">
          Abra o link neste mesmo navegador para escolher a nova senha.
        </p>
      </div>
    );
  }

  const emailError = state.fieldErrors?.email;
  const formError = state.status === "error" && !emailError ? state.message : undefined;
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field id="email" label="E-mail da conta" error={emailError}>
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
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "email-erro" : undefined}
        />
      </Field>
      {formError ? (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="w-full" size="lg">
        {pending ? "Enviando…" : "Enviar link de recuperação"}
      </Button>
    </form>
  );
}
