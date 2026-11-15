import { describe, expect, it } from "vitest";
import { PASSWORD_MAX_LENGTH, passwordProblem, passwordRules } from "../password";

describe("passwordProblem", () => {
  it("aceita senha com tamanho, minúscula, maiúscula e número", () => {
    expect(passwordProblem("Senha-forte-42")).toBeNull();
  });

  it.each([
    ["Curta1a", "caracteres"],
    ["SEMMINUSCULA123", "minúscula"],
    ["semmaiuscula123", "maiúscula"],
    ["SemNumeroNenhum", "número"],
  ])("recusa %s apontando a regra (%s)", (password, fragment) => {
    expect(passwordProblem(password)).toContain(fragment);
  });

  it("recusa senha acima do limite do bcrypt (em bytes, não em letras)", () => {
    expect(passwordProblem(`Aa1${"x".repeat(PASSWORD_MAX_LENGTH)}`)).toContain("no máximo");
    expect(passwordProblem(`Aa1${"é".repeat(40)}`)).toContain("no máximo");
  });
});

describe("passwordRules", () => {
  it("marca cada requisito atendido", () => {
    const met = Object.fromEntries(passwordRules("abcdefghij").map((rule) => [rule.id, rule.met]));
    expect(met).toEqual({ length: true, lower: true, upper: false, digit: false });
  });
});
