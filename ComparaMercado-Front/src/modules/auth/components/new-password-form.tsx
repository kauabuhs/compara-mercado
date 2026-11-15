"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Field } from "@/components/ui/primitives";
import { type AuthState, updatePassword } from "@/modules/auth/actions";
import { PasswordRules } from "./password-rules";

const IDLE: AuthState = { status: "idle" };

/** Escolher uma nova senha: serve ao link de recuperação e à troca de senha dentro da conta. */
export function NewPasswordForm({ submitLabel = "Salvar nova senha" }: { submitLabel?: string }) {
  const [state, action, pending] = useActionState(updatePassword, IDLE);
  const [password, setPassword] = useState("");
  const passwordError = state.fieldErrors?.password;
  const formError = state.status === "error" && !passwordError ? state.message : undefined;
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field id="password" label="Nova senha" error={passwordError}>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? "password-erro password-regras" : "password-regras"}
        />
      </Field>
      <PasswordRules id="password-regras" password={password} />
      {formError ? (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="w-full" size="lg">
        {pending ? "Salvando…" : submitLabel}
      </Button>
    </form>
  );
}
