import { ConfirmSubmitButton } from "@/components/shared/confirm-submit";
import { Select } from "@/components/ui/primitives";
import { REJECTION_REASONS } from "@/modules/admin/rejection-reasons";

/**
 * Rejeitar (ou retirar) um preço explicando o motivo a quem o enviou. A ação recebe o formulário
 * como último argumento e lê o campo `reason`; sem motivo escolhido, rejeita sem explicação.
 */
export function RejectForm({
  action,
  title,
  description,
  confirmLabel,
  idPrefix,
}: {
  /** Server Action já amarrada ao alvo (`reviewObservation.bind(null, id, "rejected")`). */
  action: (form: FormData) => Promise<void>;
  title: string;
  description: string;
  confirmLabel: string;
  /** Torna único o `id` do campo quando há vários formulários na página. */
  idPrefix: string;
}) {
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <div className="w-full sm:w-72">
        <Select
          id={`${idPrefix}-motivo`}
          name="reason"
          aria-label="Motivo da rejeição"
          defaultValue=""
        >
          <option value="">Sem motivo</option>
          {REJECTION_REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {reason}
            </option>
          ))}
        </Select>
      </div>
      <ConfirmSubmitButton
        variant="secondary"
        className="text-danger"
        confirmation={{
          variant: "alert",
          title,
          description,
          confirmLabel,
          destructive: true,
        }}
      >
        {confirmLabel}
      </ConfirmSubmitButton>
    </form>
  );
}
