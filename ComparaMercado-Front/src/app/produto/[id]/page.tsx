import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FreshnessLabel, PriceTag } from "@/components/shared/price";
import {
  Badge,
  Card,
  EmptyState,
  Group,
  GroupRow,
  ProductAvatar,
} from "@/components/ui/primitives";
import { formatSize, formatValidUntil } from "@/lib/format";
import { PriceHistory } from "@/modules/catalog/components/price-history";
import { AddToListButton } from "@/modules/shopping-list/components/add-to-list";
import { getProductDetails } from "@/services/api/endpoints";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const productDetails = await getProductDetails((await params).id);
  return { title: productDetails ? productDetails.product.name : "Produto não encontrado" };
}

export default async function ProductPage({ params }: Params) {
  const productDetails = await getProductDetails((await params).id);
  if (!productDetails) notFound();
  const { product, prices, history } = productDetails;

  return (
    <article className="space-y-6">
      <header className="flex items-center gap-4">
        <ProductAvatar name={product.name} className="size-16 rounded-2xl text-3xl" />
        <div className="min-w-0 space-y-1">
          <h1 className="type-title">{product.name}</h1>
          <p className="text-muted-foreground">
            {[product.brand, formatSize(product.sizeValue, product.sizeUnit)]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </header>

      <AddToListButton productId={product.id} name={product.name} />

      <section aria-labelledby="precos" className="space-y-3">
        <h2 id="precos" className="type-heading">
          Preço em cada mercado
        </h2>
        {prices.length === 0 ? (
          <EmptyState
            title="Sem preço por enquanto"
            description="Nenhum mercado tem preço vigente para este produto."
          />
        ) : (
          <Group>
            {prices.map((storePrice, rank) => {
              const validUntilLabel = formatValidUntil(storePrice.validTo);
              return (
                <GroupRow
                  key={storePrice.storeId}
                  className={`flex items-center justify-between gap-4 px-4 py-4 ${rank === 0 && prices.length > 1 ? "bg-brand-soft" : ""}`}
                >
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {storePrice.storeName}
                      {rank === 0 && prices.length > 1 ? (
                        <Badge tone="brand">mais barato</Badge>
                      ) : null}
                      {storePrice.promo ? (
                        <Badge tone="warning">oferta {validUntilLabel ?? ""}</Badge>
                      ) : null}
                    </p>
                    {storePrice.storeNeighborhood ? (
                      <p className="type-caption">{storePrice.storeNeighborhood}</p>
                    ) : null}
                    <FreshnessLabel ageDays={storePrice.ageDays} freshness={storePrice.freshness} />
                  </div>
                  <PriceTag
                    priceCents={storePrice.priceCents}
                    unitPriceCents={storePrice.unitPriceCents}
                    baseUnit={storePrice.baseUnit}
                  />
                </GroupRow>
              );
            })}
          </Group>
        )}
      </section>

      {history.length > 1 ? (
        <section aria-labelledby="historico" className="space-y-3">
          <h2 id="historico" className="type-heading">
            Histórico (90 dias)
          </h2>
          <Card className="p-4">
            <PriceHistory points={history} />
          </Card>
        </section>
      ) : null}
    </article>
  );
}
