"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { type AuthState, signInWithEmail } from "@/modules/auth/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signInWithEmail, {
    status: "idle",
  });
  const hasError = state.status === "error" && Boolean(state.message);
  return (
    <form action={action} className="space-y-3">
      <Field id="email" label="Seu e-mail" error={hasError ? state.message : undefined}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="voce@exemplo.com"
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? "email-erro" : undefined}
        />
      </Field>
      <Button type="submit" loading={pending} className="w-full">
        {pending ? "Enviando…" : "Receber link de acesso"}
      </Button>
      {state.message && !hasError ? (
        <p role="status" className="text-sm text-success-soft-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
