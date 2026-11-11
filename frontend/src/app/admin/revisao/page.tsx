import { Badge, Button, Card, EmptyState, formatBRL } from "@compara/ui";
import { redirect } from "next/navigation";
import { reviewObservation } from "@/features/admin/actions";
import { getReviewQueue } from "@/shared/api/endpoints";
import { getAccessToken } from "@/shared/server/session";

export default async function ReviewQueuePage() {
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/conta");
  const pendingObservations = await getReviewQueue(accessToken);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Fila de revisão</h1>
      {pendingObservations.length === 0 ? (
        <EmptyState
          title="Nada para revisar"
          description="Quando houver preços de encartes ou fotos de etiqueta com baixa confiança, eles aparecem aqui."
        />
      ) : (
        <ul className="space-y-3">
          {pendingObservations.map((observation) => {
            const confidence = observation.confidence ?? 0;
            return (
              <li key={observation.id}>
                <Card className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{observation.productName}</p>
                      <p className="text-sm text-muted-foreground">{observation.storeName}</p>
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
                      <Button type="submit" variant="outline">
                        Rejeitar
                      </Button>
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
