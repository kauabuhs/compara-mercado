import { redirect } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/shared/confirm-submit";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatBRL } from "@/lib/format";
import { reviewObservation } from "@/modules/admin/actions";
import { getAccessToken } from "@/server/session";
import { getReviewQueue } from "@/services/api/endpoints";

export default async function ReviewQueuePage() {
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/conta");
  const pendingObservations = await getReviewQueue(accessToken);

  return (
    <div className="space-y-4">
      <PageHeader title="Fila de revisão" />
      {pendingObservations.length === 0 ? (
        <EmptyState
          title="Nada para revisar"
          description="Quando houver preços de encartes ou fotos de etiqueta com baixa confiança, eles aparecem aqui."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {pendingObservations.map((observation) => {
            const confidence = observation.confidence ?? 0;
            return (
              <li key={observation.id}>
                <Card className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{observation.productName}</p>
                      <p className="type-caption">{observation.storeName}</p>
                      <div className="mt-1 flex gap-2">
                        <Badge>{observation.source}</Badge>
                        <Badge tone={confidence < 0.9 ? "warning" : "brand"}>
                          confiança {confidence.toFixed(2)}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-2xl font-semibold tabular-nums">
                      {formatBRL(observation.priceCents)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <form action={reviewObservation.bind(null, observation.id, "approved")}>
                      <Button type="submit">Aprovar</Button>
                    </form>
                    <form action={reviewObservation.bind(null, observation.id, "rejected")}>
                      <ConfirmSubmitButton
                        variant="secondary"
                        className="text-danger"
                        confirmation={{
                          variant: "alert",
                          title: `Rejeitar o preço de ${observation.productName}?`,
                          description: "Ele não será publicado e sai da fila de revisão.",
                          confirmLabel: "Rejeitar",
                          destructive: true,
                        }}
                      >
                        Rejeitar
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
