import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Badge, EmptyState, Input, PageHeader } from "@/components/ui/primitives";
import { CategoryForm } from "@/modules/admin/components/registry-forms";
import { NewRecord, RegistryRow } from "@/modules/admin/components/registry-list";
import { listPageHref, parseListParams, type SearchParams } from "@/modules/admin/list-params";
import { getAccessToken } from "@/server/session";
import { listAdminCategories } from "@/services/api/endpoints";

export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/conta");
  const params = parseListParams(await searchParams);
  const [categories, options] = await Promise.all([
    listAdminCategories(accessToken, params),
    // opções do seletor "Dentro de" (a API entrega até 50 por página)
    listAdminCategories(accessToken, { pageSize: 50 }),
  ]);
  const optionList = options.items.map((category) => ({ id: category.id, name: category.name }));
  const nameById = new Map(optionList.map((category) => [category.id, category.name]));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Categorias"
        description="Agrupam os produtos (Hortifruti, Mercearia…). Categorias não saem do ar: renomeie ou mude de lugar."
      />
      <NewRecord title="Cadastrar categoria">
        <CategoryForm categories={optionList} />
      </NewRecord>
      <search>
        <form method="get" className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input
            type="search"
            name="q"
            aria-label="Buscar categoria pelo nome"
            placeholder="Buscar categoria pelo nome"
            defaultValue={params.q}
            maxLength={80}
          />
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
      </search>
      {categories.items.length === 0 ? (
        <EmptyState
          title="Nenhuma categoria encontrada"
          description="Cadastre a primeira categoria ou limpe a busca."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {categories.items.map((category) => (
            <RegistryRow
              key={category.id}
              title={category.name}
              meta={category.slug}
              badges={
                category.parentId ? (
                  <Badge>dentro de {nameById.get(category.parentId) ?? "outra categoria"}</Badge>
                ) : (
                  <Badge tone="brand">principal</Badge>
                )
              }
            >
              <CategoryForm category={category} categories={optionList} />
            </RegistryRow>
          ))}
        </ul>
      )}
      <Pagination
        page={categories.page}
        pageSize={categories.pageSize}
        total={categories.total}
        hrefFor={(target) => listPageHref("/admin/categorias", params, target)}
        className="pt-2"
      />
    </div>
  );
}
