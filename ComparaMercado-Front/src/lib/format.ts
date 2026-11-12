import type { BaseUnit } from "@contracts";

const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});

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
