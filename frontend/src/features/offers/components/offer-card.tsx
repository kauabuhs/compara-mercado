import type { PriceOffer } from "@compara/contracts";
import { Badge, Card, FreshnessLabel, PriceTag } from "@compara/ui";
import Link from "next/link";
import { formatSize, formatValidUntil } from "@/shared/lib/format";

export function OfferCard({ offer }: { offer: PriceOffer }) {
  const until = formatValidUntil(offer.validTo);
  return (
    <Link href={`/produto/${offer.productId}`} className="block animate-fade-in rounded-2xl">
      <Card className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-surface-muted">
        <div className="min-w-0">
          <p className="truncate font-medium">{offer.productName}</p>
          <p className="truncate text-sm text-muted-foreground">
            {[offer.brand, formatSize(offer.sizeValue, offer.sizeUnit)].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{offer.storeName}</span>
            {until ? <Badge tone="brand">{until}</Badge> : null}
          </p>
          <FreshnessLabel ageDays={offer.ageDays} freshness={offer.freshness} />
        </div>
        <PriceTag
          priceCents={offer.priceCents}
          unitPriceCents={offer.unitPriceCents}
          baseUnit={offer.baseUnit}
        />
      </Card>
    </Link>
  );
}
