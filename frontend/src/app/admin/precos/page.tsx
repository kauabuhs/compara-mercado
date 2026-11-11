import type { PriceFormOptions } from "@compara/contracts";
import { Card } from "@compara/ui";
import { redirect } from "next/navigation";
import { PriceForm } from "@/features/admin/components/price-form";
import { getPriceFormOptions } from "@/shared/api/endpoints";
import { formatSize } from "@/shared/lib/format";
import { getAccessToken } from "@/shared/server/session";

function formatProductOptionLabel(product: PriceFormOptions["products"][number]): string {
  const brandSuffix = product.brand ? ` — ${product.brand}` : "";
  return `${product.name}${brandSuffix} (${formatSize(product.sizeValue, product.sizeUnit)})`;
}

export default async function ManualPricesPage() {
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/conta");
  const { stores, products } = await getPriceFormOptions(accessToken);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Lançar preço</h1>
      <p className="text-muted-foreground">
        Cadastro manual da cesta básica (Fase 1). O preço por kg/litro é calculado automaticamente.
      </p>
      <Card className="p-5">
        <PriceForm
          stores={stores.map((store) => ({ id: store.id, label: store.name }))}
          products={products.map((product) => ({
            id: product.id,
            label: formatProductOptionLabel(product),
          }))}
        />
      </Card>
    </div>
  );
}
