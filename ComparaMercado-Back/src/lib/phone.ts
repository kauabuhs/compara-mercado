/** Telefone no formato E.164: `+` e 8 a 15 dígitos, sem zero à esquerda (`+5554999990000`). */
export const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

/** País assumido quando o número vem sem código internacional (a base de usuários é brasileira). */
const DEFAULT_COUNTRY_CODE = "55";

/**
 * Normaliza o que a pessoa digitou para E.164. Aceita máscara e espaços (`(54) 99999-0000`),
 * o número só com DDD (`54999990000`), com o `55` na frente e com `+`. Texto vazio vira `null`
 * (apagar o telefone). Devolve `undefined` quando não dá para formar um número válido.
 */
export function normalizePhone(input: string): string | null | undefined {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (/[^\d\s()+.-]/.test(trimmed)) return undefined; // letras e outros símbolos: não é telefone

  const digits = trimmed.replace(/\D/g, "");
  let candidate: string;
  if (trimmed.startsWith("+")) {
    candidate = digits;
  } else {
    // Sem `+`, só o formato brasileiro é inequívoco: DDD + número (10 fixo / 11 celular) ou o
    // `55` na frente (12 / 13 dígitos). Qualquer outra coisa é ambígua demais para adivinhar.
    const national = digits.replace(/^0+/, ""); // zero de tronco (`054 ...`)
    if (national.length === 10 || national.length === 11) {
      candidate = `${DEFAULT_COUNTRY_CODE}${national}`;
    } else if (
      national.startsWith(DEFAULT_COUNTRY_CODE) &&
      (national.length === 12 || national.length === 13)
    ) {
      candidate = national;
    } else {
      return undefined;
    }
  }
  const e164 = `+${candidate}`;
  return E164_PATTERN.test(e164) ? e164 : undefined;
}
