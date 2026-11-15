import { redirect } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/shared/confirm-submit";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";
import { StoreForm } from "@/modules/admin/components/registry-forms";
import { NewRecord, RegistryRow, RegistryToolbar } from "@/modules/admin/components/registry-list";
import { listPageHref, parseListParams, type SearchParams } from "@/modules/admin/list-params";
import { setStoreStatus } from "@/modules/admin/registry-actions";
import { getAccessToken } from "@/server/session";
import { listAdminCities, listAdminStores } from "@/services/api/endpoints";

const STATUS_BADGE = {
  active: { label: "ativo", tone: "success" },
  pending: { label: "pendente", tone: "warning" },
  inactive: { label: "inativo", tone: "neutral" },
} as const;

export default async function AdminStoresPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/conta");
  const params = parseListParams(await searchParams);
  const [stores, cityOptions] = await Promise.all([
    listAdminStores(accessToken, params),
    // Opções do seletor de cidade: só as habilitadas (a biblioteca do IBGE tem mais de 5 mil
    // municípios e a API entrega no máximo 50 por página). Habilite a cidade em /admin/cidades.
    listAdminCities(accessToken, { pageSize: 50, situation: "active" }),
  ]);
  const cities = cityOptions.items.map((city) => ({ id: city.id, name: city.name }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mercados"
        description="Só mercados ativos aparecem para as pessoas. Nada é apagado: inative para tirar do ar."
      />
      {cities.length === 0 ? (
        <EmptyState
          title="Cadastre uma cidade primeiro"
          description="Todo mercado pertence a uma cidade."
        />
      ) : (
        <NewRecord title="Cadastrar mercado">
          <StoreForm cities={cities} />
        </NewRecord>
      )}
      <RegistryToolbar
        params={params}
        searchLabel="Buscar mercado pelo nome"
        activeLabel="Ativos"
        inactiveLabel="Pendentes e inativos"
      />
      {stores.items.length === 0 ? (
        <EmptyState
          title="Nenhum mercado encontrado"
          description="Cadastre o primeiro mercado ou limpe a busca."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {stores.items.map((store) => {
            const badge = STATUS_BADGE[store.status];
            return (
              <RegistryRow
                key={store.id}
                title={store.name}
                meta={[store.neighborhood, store.cityName].filter(Boolean).join(" · ")}
                badges={<Badge tone={badge.tone}>{badge.label}</Badge>}
                actions={
                  <form
                    action={setStoreStatus.bind(
                      null,
                      store.id,
                      store.status === "active" ? "inactive" : "active",
                    )}
                  >
                    {store.status === "active" ? (
                      <ConfirmSubmitButton
                        variant="secondary"
                        size="sm"
                        confirmation={{
                          variant: "alert",
                          title: `Inativar ${store.name}?`,
                          description:
                            "O mercado sai do mapa e das comparações. Os preços continuam guardados.",
                          confirmLabel: "Inativar",
                          destructive: true,
                        }}
                      >
                        Inativar
                      </ConfirmSubmitButton>
                    ) : (
                      <Button type="submit" size="sm">
                        Ativar
                      </Button>
                    )}
                  </form>
                }
              >
                <StoreForm store={store} cities={cities} />
              </RegistryRow>
            );
          })}
        </ul>
      )}
      <Pagination
        page={stores.page}
        pageSize={stores.pageSize}
        total={stores.total}
        hrefFor={(target) => listPageHref("/admin/mercados", params, target)}
        className="pt-2"
      />
    </div>
  );
}
