import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatBRL } from "@/lib/format";
import { PAGE_PARAM, parsePage, totalPages } from "@/lib/pagination";
import { withParams } from "@/lib/search-params";
import { decideModeration } from "@/modules/admin/actions";
import { RejectForm } from "@/modules/admin/components/reject-form";
import { REPORT_REASON_LABEL } from "@/modules/admin/report-reasons";
import { getAccessToken } from "@/server/session";
import { getModerationQueue } from "@/services/api/endpoints";

export const metadata = { title: "Moderação" };

export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/conta");
  const requestedPage = parsePage((await searchParams)[PAGE_PARAM]);
  const queue = await getModerationQueue(accessToken, { page: requestedPage });

  // Decidir esvazia a fila: se a página atual ficou vazia, volta para a última que existe.
  if (queue.items.length === 0 && queue.total > 0 && requestedPage > 1) {
    const lastPage = totalPages(queue.total, queue.pageSize);
    redirect(
      `/admin/moderacao${withParams("", { [PAGE_PARAM]: lastPage === 1 ? null : lastPage })}`,
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Moderação"
        description="Preços que a comunidade denunciou ou contestou. Retirar um preço publicado o tira das comparações na hora."
      />
      {queue.items.length === 0 ? (
        <EmptyState
          title="Nada para moderar"
          description="Quando três pessoas denunciarem um preço, ou duas disserem que ele mudou, ele aparece aqui."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {queue.items.map((item) => {
            const published = item.status === "approved";
            const productLabel = item.productName ?? "produto";
            return (
              <li key={item.taskId}>
                <Card className="space-y-3 p-4">
                  {item.hasPhoto ? (
                    <a
                      href={`/admin/foto/${item.observationId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir a foto da etiqueta de ${productLabel} em tamanho grande`}
                    >
                      {/* biome-ignore lint/performance/noImgElement: foto privada servida pelo próprio app, sem otimização de imagem */}
                      <img
                        src={`/admin/foto/${item.observationId}`}
                        alt={`Foto da etiqueta de ${productLabel}`}
                        loading="lazy"
                        className="max-h-72 w-full rounded-2xl bg-fill object-contain"
                      />
                    </a>
                  ) : null}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">{item.productName ?? "Produto indisponível"}</p>
                      <p className="type-caption">{item.storeName ?? "Mercado indisponível"}</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={published ? "success" : "warning"}>
                          {published ? "publicado" : "aguardando"}
                        </Badge>
                        {item.promo ? <Badge tone="brand">oferta</Badge> : null}
                        {item.changes > 0 ? (
                          <Badge tone="info">
                            {item.changes} {item.changes === 1 ? "pessoa diz" : "pessoas dizem"} que
                            mudou
                          </Badge>
                        ) : null}
                        {item.reports.map((report) => (
                          <Badge key={report.reason} tone="danger">
                            {report.count}× {REPORT_REASON_LABEL[report.reason]}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <p className="text-2xl font-semibold tabular-nums">
                      {formatBRL(item.priceCents)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {published ? (
                      <form action={decideModeration.bind(null, item.taskId, "keep")}>
                        <Button type="submit">Manter</Button>
                      </form>
                    ) : (
                      <form action={decideModeration.bind(null, item.taskId, "approve")}>
                        <Button type="submit">Aprovar</Button>
                      </form>
                    )}
                    <RejectForm
                      idPrefix={item.taskId}
                      action={decideModeration.bind(null, item.taskId, "reject")}
                      title={
                        published
                          ? `Retirar o preço de ${productLabel}?`
                          : `Rejeitar o preço de ${productLabel}?`
                      }
                      description={
                        published
                          ? "Ele sai das comparações agora. Quem enviou vê o motivo escolhido."
                          : "Ele não será publicado. Quem enviou vê o motivo escolhido."
                      }
                      confirmLabel={published ? "Retirar" : "Rejeitar"}
                    />
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
          `/admin/moderacao${withParams("", { [PAGE_PARAM]: target === 1 ? null : target })}`
        }
        className="pt-2"
      />
    </div>
  );
}
