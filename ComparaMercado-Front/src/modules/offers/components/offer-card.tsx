import type { PriceOffer } from "@contracts";
import Link from "next/link";
import { FreshnessLabel, PriceTag } from "@/components/shared/price";
import { Badge, Card, ProductAvatar } from "@/components/ui/primitives";
import { formatSize, formatValidUntil } from "@/lib/format";

export function OfferCard({ offer }: { offer: PriceOffer }) {
  const until = formatValidUntil(offer.validTo);
  return (
    <Link
      href={`/produto/${offer.productId}`}
      className="group block h-full animate-fade-in rounded-2xl"
    >
      <Card className="flex h-full items-center gap-3 p-4 transition-[background-color,transform] duration-200 group-hover:bg-surface-muted group-active:scale-[0.985]">
        <ProductAvatar name={offer.productName} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{offer.productName}</p>
          <p className="truncate text-sm text-muted-foreground">
            {[offer.brand, formatSize(offer.sizeValue, offer.sizeUnit)].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-medium">{offer.storeName}</span>
            {until ? <Badge tone="brand">{until}</Badge> : null}
          </p>
          <FreshnessLabel ageDays={offer.ageDays} freshness={offer.freshness} />
        </div>
        <PriceTag
          priceCents={offer.priceCents}
          unitPriceCents={offer.unitPriceCents}
          baseUnit={offer.baseUnit}
          className="shrink-0"
        />
      </Card>
    </Link>
  );
}
