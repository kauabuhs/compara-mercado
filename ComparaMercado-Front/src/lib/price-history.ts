import type { PricePoint } from "@contracts";

/**
 * Lógica do gráfico de histórico de preço (pura: sem React nem DOM).
 *
 * O preço de um produto vale até a próxima observação, então a série é um gráfico em DEGRAUS,
 * com o eixo X em datas reais. Para "todos os mercados" a série é o MENOR PREÇO VIGENTE a cada dia:
 * cada mercado mantém o último preço conhecido até mudar, e o dia mostra o menor deles. (Pegar só
 * o menor entre as observações feitas no dia daria saltos falsos: um dia com apenas um mercado
 * caro observado pareceria uma alta.)
 */

export const DAY_MS = 86_400_000;

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** O dia (em Brasília) de um instante, como ms UTC à meia-noite. `NaN` se a data é inválida. */
export function dayStart(instant: Date | string): number {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) return Number.NaN;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKeyFormatter.format(date));
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Um degrau da série: a partir do dia `t`, o menor preço por unidade passa a ser este. */
export interface SeriesPoint {
  /** Dia, em ms UTC à meia-noite. */
  t: number;
  unitPriceCents: number;
  promo: boolean;
  /** Mercado que tem esse menor preço no dia. */
  storeId: string;
}

export interface SeriesOptions {
  /** `null` = menor preço entre todos os mercados; senão, só aquele mercado. */
  storeId: string | null;
  /** Janela em dias, contada até hoje. */
  days: number;
  now: Date;
}

interface StorePrice {
  unitPriceCents: number;
  promo: boolean;
}

export function buildSeries(points: readonly PricePoint[], options: SeriesOptions): SeriesPoint[] {
  const today = dayStart(options.now);
  const windowStart = today - options.days * DAY_MS;

  // Observações válidas, em ordem de tempo; dentro do mesmo dia a mais recente de cada mercado vale.
  const observations = points
    .filter((point) => options.storeId === null || point.storeId === options.storeId)
    .map((point) => ({
      storeId: point.storeId,
      unitPriceCents: point.unitPriceCents,
      promo: point.promo,
      time: new Date(point.observedAt).getTime(),
      day: dayStart(point.observedAt),
    }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.day))
    .filter((point) => point.day <= today)
    .sort((a, b) => a.time - b.time);

  const byDay = new Map<number, Array<{ storeId: string } & StorePrice>>();
  for (const observation of observations) {
    const list = byDay.get(observation.day) ?? [];
    list.push(observation);
    byDay.set(observation.day, list);
  }

  // Percorre os dias com observação, mantendo o último preço de cada mercado; a cada dia, o menor.
  const lastPriceByStore = new Map<string, StorePrice>();
  const steps: SeriesPoint[] = [];
  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    for (const observation of byDay.get(day) ?? []) {
      lastPriceByStore.set(observation.storeId, {
        unitPriceCents: observation.unitPriceCents,
        promo: observation.promo,
      });
    }
    let best: SeriesPoint | null = null;
    for (const [storeId, price] of lastPriceByStore) {
      if (best === null || price.unitPriceCents < best.unitPriceCents) {
        best = { t: day, unitPriceCents: price.unitPriceCents, promo: price.promo, storeId };
      }
    }
    const previous = steps[steps.length - 1];
    const changed =
      !previous ||
      previous.unitPriceCents !== best?.unitPriceCents ||
      previous.promo !== best?.promo ||
      previous.storeId !== best?.storeId;
    if (best && changed) steps.push(best);
  }

  // Recorta na janela: o preço que já valia no início dela entra como primeiro degrau.
  const inside = steps.filter((step) => step.t >= windowStart);
  const before = [...steps].reverse().find((step) => step.t < windowStart);
  const series =
    before && (inside[0]?.t ?? Number.POSITIVE_INFINITY) > windowStart
      ? [{ ...before, t: windowStart }, ...inside]
      : inside;

  // O último preço continua valendo até hoje.
  const last = series[series.length - 1];
  if (last && last.t < today) series.push({ ...last, t: today });
  return series;
}

export type Trend = "down" | "up" | "flat";

export interface HistorySummary {
  first: SeriesPoint;
  latest: SeriesPoint;
  lowest: SeriesPoint;
  highest: SeriesPoint;
  /** Diferença em centavos entre hoje e o início do período. */
  changeCents: number;
  /** Variação em %, arredondada para inteiro (0 quando o início é 0). */
  changePercent: number;
  trend: Trend;
}

export function summarize(series: readonly SeriesPoint[]): HistorySummary | null {
  const first = series[0];
  const latest = series[series.length - 1];
  if (!first || !latest) return null;
  let lowest = first;
  let highest = first;
  for (const point of series) {
    if (point.unitPriceCents < lowest.unitPriceCents) lowest = point;
    if (point.unitPriceCents > highest.unitPriceCents) highest = point;
  }
  const changeCents = latest.unitPriceCents - first.unitPriceCents;
  const changePercent =
    first.unitPriceCents === 0 ? 0 : Math.round((changeCents / first.unitPriceCents) * 100);
  const trend: Trend = changeCents < 0 ? "down" : changeCents > 0 ? "up" : "flat";
  return { first, latest, lowest, highest, changeCents, changePercent, trend };
}

/** O degrau em vigor no dia `t` (o último com `point.t <= t`); `null` antes do primeiro. */
export function valueAt(series: readonly SeriesPoint[], t: number): SeriesPoint | null {
  let found: SeriesPoint | null = null;
  for (const point of series) {
    if (point.t <= t) found = point;
    else break;
  }
  return found;
}

export interface NiceScale {
  min: number;
  max: number;
  ticks: number[];
}

/**
 * Escala "bonita" para o eixo de preços (em centavos): limites e marcas em múltiplos de 1, 2 ou 5
 * (× potência de 10), com folga para a linha não encostar nas bordas. Série plana ganha uma
 * faixa em volta do valor em vez de uma linha colada no meio de um eixo vazio.
 */
export function niceScale(minCents: number, maxCents: number, targetTicks = 4): NiceScale {
  let low = minCents;
  let high = maxCents;
  if (high - low < 1) {
    const padding = Math.max(10, Math.round(high * 0.1));
    low -= padding;
    high += padding;
  }
  low = Math.max(0, low);
  const rough = (high - low) / Math.max(1, targetTicks - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = Math.max(
    1,
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude,
  );
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let value = min; value <= max + step / 2; value += step) ticks.push(Math.round(value));
  return { min, max, ticks };
}

/** Datas (ms UTC) para os rótulos do eixo X: início, fim e pontos igualmente espaçados entre eles. */
export function timeTicks(startT: number, endT: number, maxTicks = 4): number[] {
  const spanDays = Math.round((endT - startT) / DAY_MS);
  if (spanDays <= 0) return [startT];
  const count = Math.min(maxTicks, spanDays + 1);
  if (count <= 1) return [startT];
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? endT : startT + Math.round((spanDays * index) / (count - 1)) * DAY_MS,
  );
}

/** Mapeia [d0, d1] em [r0, r1] linearmente; domínio de tamanho zero cai no meio do intervalo. */
export function linearScale(
  [d0, d1]: readonly [number, number],
  [r0, r1]: readonly [number, number],
): (value: number) => number {
  const span = d1 - d0;
  return (value) => (span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0));
}

/** Caminho SVG em degraus: mantém o preço até o próximo dia e só então "salta". */
export function stepPath(
  series: readonly SeriesPoint[],
  x: (t: number) => number,
  y: (cents: number) => number,
): string {
  const parts: string[] = [];
  series.forEach((point, index) => {
    const px = x(point.t).toFixed(1);
    const py = y(point.unitPriceCents).toFixed(1);
    if (index === 0) parts.push(`M${px},${py}`);
    else parts.push(`H${px}`, `V${py}`);
  });
  return parts.join(" ");
}
