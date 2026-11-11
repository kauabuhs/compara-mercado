/** Valida GTIN-8/12/13/14 (código de barras) pelo dígito verificador. */
export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop();
  if (check === undefined) return false;
  let sum = 0;
  // Da direita para a esquerda, pesos alternados 3,1,3,1...
  for (let i = digits.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += (digits[i] ?? 0) * weight;
  }
  return (10 - (sum % 10)) % 10 === check;
}

/** Remove tudo que não é dígito; devolve null se o GTIN for inválido. */
export function normalizeGtin(raw: string): string | null {
  const cleaned = raw.replace(/\D/g, "");
  return isValidGtin(cleaned) ? cleaned : null;
}
