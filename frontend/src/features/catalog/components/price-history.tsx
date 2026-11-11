import type { PricePoint } from "@compara/contracts";
import { formatBRL } from "@compara/ui";

const CHART_WIDTH = 320;
const CHART_HEIGHT = 96;
const CHART_PADDING = 8;

/**
 * Histórico do menor preço por dia, em SVG puro (sem biblioteca de gráfico).
 * Acessível: o resumo textual substitui o desenho para leitores de tela.
 */
export function PriceHistory({ points }: { points: readonly PricePoint[] }) {
  const lowestUnitPriceByDay = new Map<string, number>();
  for (const point of points) {
    const day = point.observedAt.slice(0, 10);
    const currentLowest = lowestUnitPriceByDay.get(day);
    if (currentLowest === undefined || point.unitPriceCents < currentLowest) {
      lowestUnitPriceByDay.set(day, point.unitPriceCents);
    }
  }
  const dailySeries = [...lowestUnitPriceByDay].sort(([firstDay], [secondDay]) =>
    firstDay.localeCompare(secondDay),
  );
  if (dailySeries.length < 2) return null;

  const unitPrices = dailySeries.map(([, unitPriceCents]) => unitPriceCents);
  const min = Math.min(...unitPrices);
  const max = Math.max(...unitPrices);
  const priceRange = Math.max(1, max - min);
  const path = dailySeries
    .map(([, unitPriceCents], index) => {
      const x =
        CHART_PADDING + (index / (dailySeries.length - 1)) * (CHART_WIDTH - CHART_PADDING * 2);
      const y =
        CHART_HEIGHT -
        CHART_PADDING -
        ((unitPriceCents - min) / priceRange) * (CHART_HEIGHT - CHART_PADDING * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const latestUnitPrice = unitPrices[unitPrices.length - 1] ?? min;

  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={`Histórico: menor preço por unidade variou de ${formatBRL(min)} a ${formatBRL(max)}; hoje ${formatBRL(latestUnitPrice)}.`}
        className="h-24 w-full"
      >
        <path
          d={path}
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <figcaption className="flex justify-between text-sm text-muted-foreground">
        <span>Mínimo {formatBRL(min)}</span>
        <span>Máximo {formatBRL(max)}</span>
      </figcaption>
    </figure>
  );
}
