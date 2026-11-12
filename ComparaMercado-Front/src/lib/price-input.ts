/** Preço digitado em formulário → centavos inteiros. Regra pura (sem React nem rede). */

const PRICE_PATTERN = /^\d{1,6}([.,]\d{1,2})?$/;

/**
 * Aceita "5,99", "5.99" ou "6" (até 2 casas, sem milhar, sem "R$"). Devolve centavos inteiros,
 * ou `null` se o texto não for um preço válido maior que zero.
 */
export function parsePriceToCents(raw: string): number | null {
  const text = raw.trim();
  if (!PRICE_PATTERN.test(text)) return null;
  const cents = Math.round(Number(text.replace(",", ".")) * 100);
  return cents > 0 ? cents : null;
}
