import { describe, expect, it } from "vitest";
import {
  ageInDays,
  assertCents,
  compareList,
  DomainError,
  freshnessOf,
  isValidGtin,
  normalizeGtin,
  normalizeName,
  parseSize,
  reaisToCents,
  toBaseQuantity,
  unitPriceCents,
} from "./index";

describe("money", () => {
  it("converte reais em centavos sem erro de ponto flutuante", () => {
    expect(reaisToCents(5.99)).toBe(599);
    expect(reaisToCents(0.1 + 0.2)).toBe(30);
  });

  it("recusa centavos inválidos", () => {
    expect(() => assertCents(1.5)).toThrow(DomainError);
    expect(() => assertCents(-1)).toThrow(DomainError);
    expect(() => assertCents(Number.NaN)).toThrow(DomainError);
  });
});

describe("units", () => {
  it("converte para a unidade base", () => {
    expect(toBaseQuantity(500, "g")).toEqual({ quantity: 0.5, base: "kg" });
    expect(toBaseQuantity(900, "ml")).toEqual({ quantity: 0.9, base: "l" });
    expect(toBaseQuantity(12, "un")).toEqual({ quantity: 12, base: "un" });
  });

  it("calcula preço por unidade base", () => {
    expect(unitPriceCents(300, 500, "g")).toBe(600); // R$ 3,00 / 500 g = R$ 6,00/kg
    expect(unitPriceCents(599, 1, "kg")).toBe(599);
    expect(unitPriceCents(1200, 12, "un")).toBe(100);
    expect(unitPriceCents(499, 900, "ml")).toBe(554); // arredonda para o centavo
  });

  it("recusa tamanho zero ou negativo", () => {
    expect(() => unitPriceCents(100, 0, "g")).toThrow(DomainError);
    expect(() => unitPriceCents(100, -1, "kg")).toThrow(DomainError);
  });
});

describe("freshness", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  it("classifica por idade", () => {
    expect(freshnessOf("2026-11-08T12:00:00Z", now)).toBe("fresh");
    expect(freshnessOf("2026-11-01T12:00:00Z", now)).toBe("recent");
    expect(freshnessOf("2026-10-20T12:00:00Z", now)).toBe("stale");
  });
  it("nunca devolve idade negativa", () => {
    expect(ageInDays("2026-12-01T00:00:00Z", now)).toBe(0);
  });
});

describe("gtin", () => {
  it("valida o dígito verificador", () => {
    expect(isValidGtin("7891000100103")).toBe(true);
    expect(isValidGtin("7891000100104")).toBe(false);
    expect(isValidGtin("123")).toBe(false);
    expect(isValidGtin("78910001001ab")).toBe(false);
  });
  it("normaliza removendo não dígitos", () => {
    expect(normalizeGtin("789 1000 100103")).toBe("7891000100103");
    expect(normalizeGtin("789 1000 100104")).toBeNull();
  });
});

describe("normalize", () => {
  it("remove acento, pontuação e caixa", () => {
    expect(normalizeName("  FEIJÃO Preto, Camil (1kg)! ")).toBe("feijao preto camil 1kg");
    expect(normalizeName("Leite 1.5L")).toBe("leite 1.5l");
    expect(normalizeName("S.A. Ltda.")).toBe("s a ltda");
  });
  it.each([
    ["Arroz Tio João 5kg", { value: 5, unit: "kg" }],
    ["Leite Integral 1,5 L", { value: 1.5, unit: "l" }],
    ["Cerveja Lata 6x350ml", { value: 2100, unit: "ml" }],
    ["Açúcar 500 g", { value: 500, unit: "g" }],
    ["Ovos 12 unidades", { value: 12, unit: "un" }],
  ])("extrai o tamanho de %s", (text, expected) => {
    expect(parseSize(text)).toEqual(expected);
  });
  it("devolve null sem tamanho", () => {
    expect(parseSize("Banana prata")).toBeNull();
  });
});

describe("compareList", () => {
  const stores = [
    { storeId: "A", distanceMeters: 1000 },
    { storeId: "B", distanceMeters: 3000 },
    { storeId: "C", distanceMeters: 500 },
  ];
  const prices = [
    { storeId: "A", productId: "arroz", priceCents: 2500 },
    { storeId: "A", productId: "feijao", priceCents: 900 },
    { storeId: "A", productId: "leite", priceCents: 600 },
    { storeId: "B", productId: "arroz", priceCents: 2300 },
    { storeId: "B", productId: "feijao", priceCents: 1000 },
    { storeId: "B", productId: "leite", priceCents: 500 },
    // C não tem leite
    { storeId: "C", productId: "arroz", priceCents: 2600 },
    { storeId: "C", productId: "feijao", priceCents: 800 },
  ];
  const items = [
    { productId: "arroz", quantity: 1 },
    { productId: "feijao", quantity: 2 },
    { productId: "leite", quantity: 3 },
  ];

  it("totaliza por mercado e ordena os completos primeiro", () => {
    const comparison = compareList(items, prices, stores);
    // A: 2500 + 1800 + 1800 = 6100 ; B: 2300 + 2000 + 1500 = 5800 ; C incompleto
    expect(comparison.stores.map((store) => [store.storeId, store.totalCents])).toEqual([
      ["B", 5800],
      ["A", 6100],
      ["C", 4200],
    ]);
    expect(comparison.stores[2]?.missingProductIds).toEqual(["leite"]);
    expect(comparison.stores[2]?.complete).toBe(false);
    expect(comparison.bestSingle?.storeId).toBe("B");
  });

  it("encontra a melhor divisão entre dois mercados com economia e distância extra", () => {
    const comparison = compareList(items, prices, stores);
    // B (arroz 2300, leite 1500) + C (feijão 1600) = 5400 -> economiza 400 vs B sozinho
    expect(comparison.bestSplit?.storeIds).toEqual(["B", "C"]);
    expect(comparison.bestSplit?.totalCents).toBe(5400);
    expect(comparison.bestSplit?.savingsCents).toBe(400);
    expect(comparison.bestSplit?.extraDistanceMeters).toBe(500); // 3000 + 500 - 3000
  });

  it("não sugere divisão quando não economiza", () => {
    const single = [
      { storeId: "A", productId: "arroz", priceCents: 100 },
      { storeId: "B", productId: "arroz", priceCents: 200 },
    ];
    const comparison = compareList(
      [{ productId: "arroz", quantity: 1 }],
      single,
      stores.slice(0, 2),
    );
    expect(comparison.bestSingle?.storeId).toBe("A");
    expect(comparison.bestSplit).toBeNull();
  });

  it("soma quantidades repetidas e ignora quantidade inválida", () => {
    const comparison = compareList(
      [
        { productId: "arroz", quantity: 1 },
        { productId: "arroz", quantity: 2 },
        { productId: "leite", quantity: 0 },
      ],
      prices,
      stores,
    );
    expect(comparison.stores.find((store) => store.storeId === "A")?.totalCents).toBe(7500);
  });

  it("usa o menor preço quando há observações duplicadas e lida com lista vazia", () => {
    const dup = [
      { storeId: "A", productId: "arroz", priceCents: 900 },
      { storeId: "A", productId: "arroz", priceCents: 700 },
    ];
    expect(
      compareList([{ productId: "arroz", quantity: 1 }], dup, [{ storeId: "A" }]).stores[0]
        ?.totalCents,
    ).toBe(700);
    const empty = compareList([], prices, stores);
    expect(empty.bestSingle).toBeNull();
    expect(empty.bestSplit).toBeNull();
  });
});
