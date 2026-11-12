import type { PriceFormOptions } from "@contracts";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/primitives";
import { formatSize } from "@/lib/format";
import { PriceForm } from "@/modules/admin/components/price-form";
import { getAccessToken } from "@/server/session";
import { getPriceFormOptions } from "@/services/api/endpoints";

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
      <PageHeader
        title="Lançar preço"
        description="Cadastro manual da cesta básica (Fase 1). O preço por kg/litro é calculado automaticamente."
      />
      <Card className="max-w-xl p-5">
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
