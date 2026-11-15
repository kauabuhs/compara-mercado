import { redirect } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/shared/confirm-submit";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatSize } from "@/lib/format";
import { ProductForm } from "@/modules/admin/components/registry-forms";
import { NewRecord, RegistryRow, RegistryToolbar } from "@/modules/admin/components/registry-list";
import { listPageHref, parseListParams, type SearchParams } from "@/modules/admin/list-params";
import { setProductStatus } from "@/modules/admin/registry-actions";
import { getAccessToken } from "@/server/session";
import { listAdminCategories, listAdminProducts } from "@/services/api/endpoints";

const STATUS_BADGE = {
  active: { label: "ativo", tone: "success" },
  draft: { label: "rascunho", tone: "warning" },
  archived: { label: "arquivado", tone: "neutral" },
} as const;

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/conta");
  const params = parseListParams(await searchParams);
  const [products, categoryOptions] = await Promise.all([
    listAdminProducts(accessToken, params),
    // opções do seletor de categoria (a API entrega até 50 por página)
    listAdminCategories(accessToken, { pageSize: 50 }),
  ]);
  const categories = categoryOptions.items.map((category) => ({
    id: category.id,
    name: category.name,
  }));
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Produtos"
        description="O catálogo que as pessoas buscam e comparam. Nada é apagado: arquive para tirar do ar."
      />
      <NewRecord title="Cadastrar produto">
        <ProductForm categories={categories} />
      </NewRecord>
      <RegistryToolbar
        params={params}
        searchLabel="Buscar por nome ou código de barras"
        activeLabel="Ativos"
        inactiveLabel="Arquivados e rascunhos"
      />
      {products.items.length === 0 ? (
        <EmptyState
          title="Nenhum produto encontrado"
          description="Cadastre o primeiro produto ou limpe a busca."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {products.items.map((product) => {
            const badge = STATUS_BADGE[product.status];
            return (
              <RegistryRow
                key={product.id}
                title={[product.name, product.brand].filter(Boolean).join(" — ")}
                meta={[
                  formatSize(product.sizeValue, product.sizeUnit),
                  product.categoryId ? categoryName.get(product.categoryId) : null,
                  product.gtin ? `GTIN ${product.gtin}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                badges={<Badge tone={badge.tone}>{badge.label}</Badge>}
                actions={
                  <form
                    action={setProductStatus.bind(
                      null,
                      product.id,
                      product.status === "active" ? "archived" : "active",
                    )}
                  >
                    {product.status === "active" ? (
                      <ConfirmSubmitButton
                        variant="secondary"
                        size="sm"
                        confirmation={{
                          variant: "alert",
                          title: `Arquivar ${product.name}?`,
                          description:
                            "O produto sai da busca e das comparações. Os preços continuam guardados.",
                          confirmLabel: "Arquivar",
                          destructive: true,
                        }}
                      >
                        Arquivar
                      </ConfirmSubmitButton>
                    ) : (
                      <Button type="submit" size="sm">
                        Reativar
                      </Button>
                    )}
                  </form>
                }
              >
                <ProductForm product={product} categories={categories} />
              </RegistryRow>
            );
          })}
        </ul>
      )}
      <Pagination
        page={products.page}
        pageSize={products.pageSize}
        total={products.total}
        hrefFor={(target) => listPageHref("/admin/produtos", params, target)}
        className="pt-2"
      />
    </div>
  );
}
