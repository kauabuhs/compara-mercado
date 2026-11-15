/**
 * Política de senha mostrada e conferida no formulário (UX). Espelha `minimum_password_length` e
 * `password_requirements` do `config.toml` do Supabase, que é quem de fato recusa senhas fracas:
 * se mudar lá, mude aqui.
 */
export const PASSWORD_MIN_LENGTH = 10;
/** Limite do bcrypt usado pelo Supabase: acima de 72 bytes o resto seria ignorado. */
export const PASSWORD_MAX_LENGTH = 72;

export interface PasswordRule {
  id: "length" | "lower" | "upper" | "digit";
  label: string;
  met: boolean;
}

/** Cada regra com o estado atual, para a lista de requisitos ao lado do campo. */
export function passwordRules(password: string): PasswordRule[] {
  return [
    {
      id: "length",
      label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`,
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    { id: "lower", label: "Uma letra minúscula", met: /[a-z]/.test(password) },
    { id: "upper", label: "Uma letra maiúscula", met: /[A-Z]/.test(password) },
    { id: "digit", label: "Um número", met: /\d/.test(password) },
  ];
}

/** Mensagem do primeiro requisito não atendido, ou `null` se a senha é aceitável. */
export function passwordProblem(password: string): string | null {
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_LENGTH) {
    return `Use no máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  }
  const unmet = passwordRules(password).find((rule) => !rule.met);
  return unmet ? `A senha precisa ter: ${unmet.label.toLowerCase()}.` : null;
}
