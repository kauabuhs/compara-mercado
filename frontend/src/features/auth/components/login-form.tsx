"use client";

import { Button, Input } from "@compara/ui";
import { useActionState } from "react";
import { type AuthState, signInWithEmail } from "@/features/auth/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signInWithEmail, {
    status: "idle",
  });
  return (
    <form action={action} className="space-y-3">
      <label htmlFor="email" className="block text-sm font-medium">
        Seu e-mail
      </label>
      <Input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="voce@exemplo.com"
      />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Enviando…" : "Receber link de acesso"}
      </Button>
      {state.message ? (
        <p
          role="status"
          className={
            state.status === "error" ? "text-sm text-danger" : "text-sm text-brand-soft-foreground"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
