import { redirect } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/shared/confirm-submit";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";
import { CityForm } from "@/modules/admin/components/registry-forms";
import { NewRecord, RegistryRow, RegistryToolbar } from "@/modules/admin/components/registry-list";
import { listPageHref, parseListParams, type SearchParams } from "@/modules/admin/list-params";
import { setCityActive } from "@/modules/admin/registry-actions";
import { getAccessToken } from "@/server/session";
import { listAdminCities } from "@/services/api/endpoints";

export default async function AdminCitiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/conta");
  const params = parseListParams(await searchParams);
  const cities = await listAdminCities(accessToken, params);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cidades"
        description="Só as cidades habilitadas aparecem no comparador. Nada é apagado: desabilite para tirar do ar."
      />
      <NewRecord title="Cadastrar cidade">
        <CityForm />
      </NewRecord>
      <RegistryToolbar
        params={params}
        searchLabel="Buscar cidade pelo nome"
        activeLabel="Habilitadas"
        inactiveLabel="Desabilitadas"
      />
      {cities.items.length === 0 ? (
        <EmptyState
          title="Nenhuma cidade encontrada"
          description="Cadastre a primeira cidade ou limpe a busca."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {cities.items.map((city) => (
            <RegistryRow
              key={city.id}
              title={city.name}
              meta={`${city.uf ?? "—"} · IBGE ${city.ibgeCode ?? "—"}`}
              badges={
                <Badge tone={city.active ? "success" : "neutral"}>
                  {city.active ? "habilitada" : "desabilitada"}
                </Badge>
              }
              actions={
                <form action={setCityActive.bind(null, city.id, !city.active)}>
                  {city.active ? (
                    <ConfirmSubmitButton
                      variant="secondary"
                      size="sm"
                      confirmation={{
                        variant: "alert",
                        title: `Desabilitar ${city.name}?`,
                        description:
                          "A cidade some do comparador e da escolha de cidade. Os preços continuam guardados.",
                        confirmLabel: "Desabilitar",
                        destructive: true,
                      }}
                    >
                      Desabilitar
                    </ConfirmSubmitButton>
                  ) : (
                    <Button type="submit" size="sm">
                      Habilitar
                    </Button>
                  )}
                </form>
              }
            >
              <CityForm city={city} />
            </RegistryRow>
          ))}
        </ul>
      )}
      <Pagination
        page={cities.page}
        pageSize={cities.pageSize}
        total={cities.total}
        hrefFor={(target) => listPageHref("/admin/cidades", params, target)}
        className="pt-2"
      />
    </div>
  );
}
