import type { BaseUnit, Freshness } from "@contracts";
import { Badge } from "@/components/ui/primitives";
import { BASE_UNIT_LABEL, formatAgeLabel, formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

/** O preço é o elemento de maior destaque; o preço por kg/litro e a data aparecem como apoio. */
export function PriceTag({
  priceCents,
  unitPriceCents,
  baseUnit,
  className,
}: {
  priceCents: number;
  unitPriceCents?: number;
  baseUnit?: BaseUnit;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-end", className)}>
      <span className="text-2xl font-semibold tabular-nums tracking-tight">
        {formatBRL(priceCents)}
      </span>
      {unitPriceCents !== undefined && baseUnit ? (
        <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
          {formatBRL(unitPriceCents)} / {BASE_UNIT_LABEL[baseUnit]}
        </span>
      ) : null}
    </div>
  );
}

/** "atualizado há 3 dias"; quando o back-end classifica como `stale`, avisa que pode estar desatualizado. */
export function FreshnessLabel({ ageDays, freshness }: { ageDays: number; freshness: Freshness }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {formatAgeLabel(ageDays)}
      {freshness === "stale" ? <Badge tone="warning">pode estar desatualizado</Badge> : null}
    </span>
  );
}
