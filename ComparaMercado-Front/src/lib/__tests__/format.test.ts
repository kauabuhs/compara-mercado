import { describe, expect, it } from "vitest";
import {
  formatAgeLabel,
  formatBRL,
  formatBRLUnit,
  formatDistance,
  formatSize,
  formatValidUntil,
} from "../format";

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

describe("formatação de distância, tamanho e validade", () => {
  it("distância", () => {
    expect(formatDistance(850)).toBe("850 m");
    expect(formatDistance(1520)).toBe("1,5 km");
    expect(formatDistance(null)).toBeNull();
  });

  it("tamanho", () => {
    expect(formatSize(5, "kg")).toBe("5 kg");
    expect(formatSize(1.5, "l")).toBe("1,5 l");
    expect(formatSize(12, "un")).toBe("12 un");
  });

  it("validade", () => {
    expect(formatValidUntil("2026-11-13T21:00:00-03:00")).toBe("até 13/11");
    expect(formatValidUntil(null)).toBeNull();
    expect(formatValidUntil("lixo")).toBeNull();
  });
});
