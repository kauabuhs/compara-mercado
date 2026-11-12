import { redirect } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/shared/confirm-submit";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatBRL } from "@/lib/format";
import { PAGE_PARAM, parsePage, totalPages } from "@/lib/pagination";
import { withParams } from "@/lib/search-params";
import { reviewObservation } from "@/modules/admin/actions";
import { getAccessToken } from "@/server/session";
import { getReviewQueue } from "@/services/api/endpoints";

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/conta");
  const requestedPage = parsePage((await searchParams)[PAGE_PARAM]);
  const queue = await getReviewQueue(accessToken, { page: requestedPage });
  const pendingObservations = queue.observations;

  // Aprovar/rejeitar esvazia a fila: se a página atual ficou vazia, volta para a última que existe.
  if (pendingObservations.length === 0 && queue.total > 0 && requestedPage > 1) {
    const lastPage = totalPages(queue.total, queue.pageSize);
    redirect(`/admin/revisao${withParams("", { [PAGE_PARAM]: lastPage === 1 ? null : lastPage })}`);
  }

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
            // Envio de pessoa (foto + preço digitado): a confiança fica em 0 = ainda não avaliado,
            // então não faz sentido exibi-la como se uma IA tivesse lido.
            const isPersonSubmission = observation.hasPhoto && confidence === 0;
            return (
              <li key={observation.id}>
                <Card className="space-y-3 p-4">
                  {observation.hasPhoto ? (
                    <a
                      href={`/admin/foto/${observation.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir a foto da etiqueta de ${observation.productName ?? "produto"} em tamanho grande`}
                    >
                      {/* biome-ignore lint/performance/noImgElement: foto privada servida pelo próprio app, sem otimização de imagem */}
                      <img
                        src={`/admin/foto/${observation.id}`}
                        alt={`Foto da etiqueta de ${observation.productName ?? "produto"}`}
                        loading="lazy"
                        className="max-h-80 w-full rounded-2xl bg-fill object-contain"
                      />
                    </a>
                  ) : null}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{observation.productName}</p>
                      <p className="type-caption">{observation.storeName}</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Badge>{isPersonSubmission ? "foto de usuário" : observation.source}</Badge>
                        {isPersonSubmission ? null : (
                          <Badge tone={confidence < 0.9 ? "warning" : "brand"}>
                            confiança {confidence.toFixed(2)}
                          </Badge>
                        )}
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
      <Pagination
        page={queue.page}
        pageSize={queue.pageSize}
        total={queue.total}
        hrefFor={(target) =>
          `/admin/revisao${withParams("", { [PAGE_PARAM]: target === 1 ? null : target })}`
        }
        className="pt-2"
      />
    </div>
  );
}
