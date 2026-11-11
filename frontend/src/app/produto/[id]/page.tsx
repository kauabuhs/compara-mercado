import { Badge, Card, EmptyState, FreshnessLabel, PriceTag } from "@compara/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PriceHistory } from "@/features/catalog/components/price-history";
import { AddToListButton } from "@/features/shopping-list/components/add-to-list";
import { getProductDetails } from "@/shared/api/endpoints";
import { formatSize, formatValidUntil } from "@/shared/lib/format";

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
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{product.name}</h1>
        <p className="text-muted-foreground">
          {[product.brand, formatSize(product.sizeValue, product.sizeUnit)]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <AddToListButton productId={product.id} name={product.name} />

      <section aria-labelledby="precos" className="space-y-3">
        <h2 id="precos" className="text-xl font-semibold">
          Preço em cada mercado
        </h2>
        {prices.length === 0 ? (
          <EmptyState
            title="Sem preço por enquanto"
            description="Nenhum mercado tem preço vigente para este produto."
          />
        ) : (
          <ol className="space-y-3">
            {prices.map((storePrice, rank) => {
              const validUntilLabel = formatValidUntil(storePrice.validTo);
              return (
                <li key={storePrice.storeId}>
                  <Card className="flex items-center justify-between gap-4 p-4">
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
                        <p className="text-sm text-muted-foreground">
                          {storePrice.storeNeighborhood}
                        </p>
                      ) : null}
                      <FreshnessLabel
                        ageDays={storePrice.ageDays}
                        freshness={storePrice.freshness}
                      />
                    </div>
                    <PriceTag
                      priceCents={storePrice.priceCents}
                      unitPriceCents={storePrice.unitPriceCents}
                      baseUnit={storePrice.baseUnit}
                    />
                  </Card>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {history.length > 1 ? (
        <section aria-labelledby="historico" className="space-y-3">
          <h2 id="historico" className="text-xl font-semibold">
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
