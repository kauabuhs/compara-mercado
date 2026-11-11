import type { BaseUnit } from "@compara/contracts";

const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

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
