import type { BaseUnit } from "@contracts";

const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});

// Datas do gráfico chegam como ms UTC à meia-noite (o dia já foi decidido em Brasília): formatar em UTC.
const dayMonthFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const longDayFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const axisPriceFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "12 ago" (sem ponto e sem "de"): cabe no eixo de um gráfico pequeno. */
export function formatDayMonth(utcMidnightMs: number): string {
  return dayMonthFormatter
    .formatToParts(utcMidnightMs)
    .filter((part) => part.type === "day" || part.type === "month")
    .map((part) => part.value.replace(".", ""))
    .join(" ");
}

/** "12 de agosto". */
export function formatLongDay(utcMidnightMs: number): string {
  return longDayFormatter.format(utcMidnightMs);
}

/** 599 -> "5,99": número do eixo, sem o símbolo da moeda. */
export function formatAxisPrice(cents: number): string {
  return axisPriceFormatter.format(cents / 100);
}

/** 599 -> "R$ 5,99". Dinheiro trafega sempre em centavos inteiros. */
export function formatBRL(cents: number): string {
  return brlFormatter.format(cents / 100);
}

export const BASE_UNIT_LABEL: Record<BaseUnit, string> = { kg: "kg", l: "litro", un: "unidade" };

/** "R$ 5,99/kg" — preço por unidade base em uma linha. */
export function formatBRLUnit(unitPriceCents: number, baseUnit: BaseUnit): string {
  return `${formatBRL(unitPriceCents)}/${BASE_UNIT_LABEL[baseUnit]}`;
}

/** Texto exibido em todo preço: "atualizado hoje", "atualizado há 3 dias". */
export function formatAgeLabel(ageDays: number): string {
  if (ageDays === 0) return "atualizado hoje";
  if (ageDays === 1) return "atualizado ontem";
  return `atualizado há ${ageDays} dias`;
}

/** "até 13/11" para ofertas com validade. */
export function formatValidUntil(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const validUntil = new Date(isoDate);
  return Number.isNaN(validUntil.getTime()) ? null : `até ${shortDateFormatter.format(validUntil)}`;
}

/** 850 -> "850 m"; 1520 -> "1,5 km". */
export function formatDistance(meters: number | null | undefined): string | null {
  if (meters === null || meters === undefined) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

export function formatSize(sizeValue: number, sizeUnit: string): string {
  const formattedValue = Number.isInteger(sizeValue)
    ? String(sizeValue)
    : String(sizeValue).replace(".", ",");
  return `${formattedValue} ${sizeUnit}`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * "agora", "há 12 min", "há 3 h", "há 2 dias": idade de uma publicação. `now` existe para os
 * testes e para a tela mostrar sempre o mesmo instante em toda a lista.
 */
export function formatTimeAgo(isoDate: string, now: number = Date.now()): string {
  const published = new Date(isoDate).getTime();
  if (Number.isNaN(published)) return "";
  const elapsed = Math.max(0, now - published);
  if (elapsed < MINUTE_MS) return "agora";
  if (elapsed < HOUR_MS) return `há ${Math.floor(elapsed / MINUTE_MS)} min`;
  if (elapsed < DAY_MS) return `há ${Math.floor(elapsed / HOUR_MS)} h`;
  const days = Math.floor(elapsed / DAY_MS);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}
