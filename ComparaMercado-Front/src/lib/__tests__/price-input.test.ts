import { describe, expect, it } from "vitest";
import { parsePriceToCents } from "../price-input";

describe("parsePriceToCents", () => {
  it("converte vírgula, ponto e inteiro em centavos sem erro de ponto flutuante", () => {
    expect(parsePriceToCents("5,99")).toBe(599);
    expect(parsePriceToCents("5.99")).toBe(599);
    expect(parsePriceToCents("6")).toBe(600);
    expect(parsePriceToCents("0,05")).toBe(5);
    expect(parsePriceToCents("19,9")).toBe(1990);
    expect(parsePriceToCents(" 1,10 ")).toBe(110);
    expect(parsePriceToCents("4,35")).toBe(435); // 4.35 * 100 = 434.99999… sem o round
  });

  it("recusa o que não é preço", () => {
    for (const invalid of [
      "",
      "abc",
      "0",
      "0,00",
      "-5",
      "5,999",
      "1.234,56",
      "R$ 5,99",
      "5,",
      ",5",
      "1e3",
    ]) {
      expect(parsePriceToCents(invalid)).toBeNull();
    }
  });
});
