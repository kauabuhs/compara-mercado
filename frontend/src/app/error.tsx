"use client";

import { Button, EmptyState } from "@compara/ui";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <EmptyState
      title="Algo deu errado"
      description="Já fomos avisados. Tente de novo; se continuar, volte em alguns minutos."
      action={<Button onClick={reset}>Tentar de novo</Button>}
    />
  );
}
