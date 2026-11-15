import { ConfirmSubmitButton } from "@/components/shared/confirm-submit";

/**
 * Sair da conta: o único item do último grupo, em vermelho, com confirmação. A Server Action vem
 * da página (módulos não importam uns aos outros).
 */
export function SignOutRow({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <ConfirmSubmitButton
        variant="ghost"
        size="lg"
        className="w-full rounded-2xl bg-surface font-medium text-base text-danger hover:bg-surface-muted"
        confirmation={{
          variant: "sheet",
          title: "Sair da conta?",
          description: "Você continua podendo consultar preços e usar sua lista sem entrar.",
          confirmLabel: "Sair",
          destructive: true,
        }}
      >
        Sair da conta
      </ConfirmSubmitButton>
    </form>
  );
}
