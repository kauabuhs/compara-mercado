import { DomainError } from "./errors";

/** Dinheiro é sempre centavos inteiros (nunca float). */
export type Cents = number;

export function assertCents(value: number, label = "valor"): asserts value is Cents {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError(
      "invalid_cents",
      `${label} deve ser um inteiro de centavos >= 0 (recebido: ${value})`,
    );
  }
}

/** Converte reais (ex.: 5.99) para centavos sem erro de ponto flutuante. */
export function reaisToCents(reais: number): Cents {
  const cents = Math.round(reais * 100);
  assertCents(cents, "reais");
  return cents;
}
