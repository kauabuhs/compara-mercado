import { describe, expect, it } from "vitest";
import { formatAgeLabel, formatBRL, formatBRLUnit } from "./format";

describe("formatação de preço", () => {
  it("formata centavos em reais", () => {
    expect(formatBRL(599).replace(/\s/g, " ")).toBe("R$ 5,99");
  });

  it("mostra o preço por unidade base", () => {
    expect(formatBRLUnit(600, "kg").replace(/\s/g, " ")).toBe("R$ 6,00/kg");
    expect(formatBRLUnit(450, "l").replace(/\s/g, " ")).toBe("R$ 4,50/litro");
  });

  it("gera o texto de atualização", () => {
    expect(formatAgeLabel(0)).toBe("atualizado hoje");
    expect(formatAgeLabel(1)).toBe("atualizado ontem");
    expect(formatAgeLabel(5)).toBe("atualizado há 5 dias");
  });
});
