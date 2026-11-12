import { DomainError } from "./domain-error";
import { assertCents, type Cents } from "./money";

/** Unidade em que o preço é comparado: kg, litro ou unidade. */
export type BaseUnit = "kg" | "l" | "un";
/** Unidades em que o tamanho de uma embalagem pode vir. */
export type SizeUnit = "g" | "kg" | "ml" | "l" | "un";

const TO_BASE: Record<SizeUnit, { base: BaseUnit; factor: number }> = {
  g: { base: "kg", factor: 0.001 },
  kg: { base: "kg", factor: 1 },
  ml: { base: "l", factor: 0.001 },
  l: { base: "l", factor: 1 },
  un: { base: "un", factor: 1 },
};

export function baseUnitOf(unit: SizeUnit): BaseUnit {
  return TO_BASE[unit].base;
}

/** Converte o tamanho da embalagem para a unidade base (500 g -> 0,5 kg). */
export function toBaseQuantity(
  value: number,
  unit: SizeUnit,
): { quantity: number; base: BaseUnit } {
  if (!Number.isFinite(value) || value <= 0) {
    throw new DomainError("invalid_size", `tamanho deve ser positivo (recebido: ${value})`);
  }
  const { base, factor } = TO_BASE[unit];
  // Arredonda a 6 casas para eliminar ruído de ponto flutuante (0.1 * 3 etc.)
  return { quantity: Math.round(value * factor * 1e6) / 1e6, base };
}

/**
 * Preço por unidade base, em centavos inteiros (arredondamento comercial).
 * Ex.: R$ 3,00 por 500 g -> 600 centavos por kg.
 */
export function unitPriceCents(priceCents: Cents, sizeValue: number, sizeUnit: SizeUnit): Cents {
  assertCents(priceCents, "preço");
  const { quantity } = toBaseQuantity(sizeValue, sizeUnit);
  return Math.round(priceCents / quantity);
}
