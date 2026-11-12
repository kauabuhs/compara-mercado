import { describe, expect, it } from "vitest";
import { normalizeText, scoreMatch, searchItems } from "../search";

describe("normalizeText", () => {
  it("remove acentos, caixa e pontuação", () => {
    expect(normalizeText("  Feijão-Preto, 1 kg! ")).toBe("feijao preto 1 kg");
  });
});

describe("scoreMatch", () => {
  it("consulta vazia casa com tudo", () => {
    expect(scoreMatch("", ["qualquer"])).toBeGreaterThan(0);
  });

  it("ignora acentos nos dois lados", () => {
    expect(scoreMatch("maca", ["Maçã gala"])).toBeGreaterThan(0);
    expect(scoreMatch("maçã", ["maca gala"])).toBeGreaterThan(0);
  });

  it("aceita só o começo da palavra", () => {
    expect(scoreMatch("arr", ["Arroz branco"])).toBeGreaterThan(0);
  });

  it("tolera uma letra errada, faltando ou trocada de lugar", () => {
    expect(scoreMatch("leiet", ["Leite integral"])).toBeGreaterThan(0);
    expect(scoreMatch("feijoa", ["Feijão preto"])).toBeGreaterThan(0);
    expect(scoreMatch("arroz", ["Arros branco"])).toBeGreaterThan(0);
    expect(scoreMatch("cafe", ["Café torrado"])).toBeGreaterThan(0);
  });

  it("não tolera erro em palavras curtas nem diferenças grandes", () => {
    expect(scoreMatch("ovo", ["Ovos"])).toBeGreaterThan(0); // começo da palavra
    expect(scoreMatch("uva", ["Ovos"])).toBe(0);
    expect(scoreMatch("sabonete", ["Sabão em pó"])).toBe(0);
  });

  it("exige todas as palavras, em qualquer ordem e campo", () => {
    expect(scoreMatch("serra sabao", ["Sabão em pó", "Serra Verde"])).toBeGreaterThan(0);
    expect(scoreMatch("serra arroz", ["Sabão em pó", "Serra Verde"])).toBe(0);
  });

  it("dá mais peso ao primeiro campo", () => {
    const inName = scoreMatch("serra", ["Serra do Mar", "Outra marca"]);
    const inBrand = scoreMatch("serra", ["Outro nome", "Serra Verde"]);
    expect(inName).toBeGreaterThan(inBrand);
  });
});

describe("searchItems", () => {
  const items = [
    { name: "Café torrado", brand: "Serra Verde" },
    { name: "Arroz branco", brand: "Serra Verde" },
    { name: "Serra de leite", brand: "Outra" },
  ];
  const fields = (item: { name: string; brand: string }) => [item.name, item.brand];

  it("devolve tudo, na ordem original, sem consulta", () => {
    expect(searchItems(items, "  ", fields)).toEqual(items);
  });

  it("filtra e ordena por relevância (nome antes de marca)", () => {
    const result = searchItems(items, "serra", fields);
    expect(result.map((item) => item.name)).toEqual([
      "Serra de leite",
      "Café torrado",
      "Arroz branco",
    ]);
  });

  it("devolve vazio quando nada casa", () => {
    expect(searchItems(items, "pneu", fields)).toEqual([]);
  });
});
