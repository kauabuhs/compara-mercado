import { describe, expect, it } from "vitest";
import {
  type CatalogProduct,
  decidePublication,
  matchProduct,
  median,
  scoreAgainstGolden,
  similarity,
  validateObservation,
} from "./index";

const catalog: CatalogProduct[] = [
  {
    id: "arroz5",
    gtin: "7891000100103",
    canonicalName: "Arroz branco tipo 1",
    brand: "Serra Verde",
    sizeValue: 5,
    sizeUnit: "kg",
  },
  {
    id: "arroz1",
    gtin: null,
    canonicalName: "Arroz branco tipo 1",
    brand: "Serra Verde",
    sizeValue: 1,
    sizeUnit: "kg",
  },
  {
    id: "feijao",
    gtin: null,
    canonicalName: "Feijão preto",
    brand: "Campo Bom",
    sizeValue: 1,
    sizeUnit: "kg",
  },
  {
    id: "leite",
    gtin: null,
    canonicalName: "Leite integral",
    brand: "Sabor da Colônia",
    sizeValue: 1,
    sizeUnit: "l",
  },
];

describe("trigram", () => {
  it("é 1 para textos iguais (ignorando acento/caixa) e 0 para disjuntos", () => {
    expect(similarity("Feijão", "feijao")).toBe(1);
    expect(similarity("abc", "xyz")).toBe(0);
  });
});

describe("matchProduct", () => {
  it("GTIN exato vence tudo", () => {
    const matchResult = matchProduct({ rawName: "qualquer coisa", gtin: "7891000100103" }, catalog);
    expect(matchResult).toMatchObject({ kind: "gtin", productId: "arroz5", confidence: 1 });
  });

  it("GTIN inválido não casa por GTIN", () => {
    const matchResult = matchProduct(
      { rawName: "Feijão preto Campo Bom 1kg", gtin: "7891000100104" },
      catalog,
    );
    expect(matchResult.kind).toBe("fuzzy");
    expect(matchResult.productId).toBe("feijao");
  });

  it("alias aprovado do mercado tem prioridade sobre o global", () => {
    const aliases = [
      {
        storeId: null,
        normalizedName: "arroz t1",
        productId: "arroz1",
        status: "approved" as const,
      },
      {
        storeId: "s1",
        normalizedName: "arroz t1",
        productId: "arroz5",
        status: "approved" as const,
      },
      {
        storeId: "s1",
        normalizedName: "feijao x",
        productId: "feijao",
        status: "pending" as const,
      },
    ];
    expect(matchProduct({ rawName: "ARROZ T1", storeId: "s1" }, catalog, aliases).productId).toBe(
      "arroz5",
    );
    expect(matchProduct({ rawName: "Arroz T1", storeId: "s2" }, catalog, aliases).productId).toBe(
      "arroz1",
    );
    // alias pendente não vale
    expect(matchProduct({ rawName: "Feijao X", storeId: "s1" }, catalog, aliases).kind).not.toBe(
      "alias",
    );
  });

  it("usa o tamanho para separar embalagens do mesmo produto", () => {
    const matchResult = matchProduct({ rawName: "Arroz Branco Tipo 1 Serra Verde 5kg" }, catalog);
    expect(matchResult.productId).toBe("arroz5");
    expect(matchResult.confidence).toBeGreaterThan(0.8);
  });

  it("tamanho diferente derruba a confiança (não compara 1 kg com 5 kg)", () => {
    const only1kg = catalog.filter((catalogProduct) => catalogProduct.id !== "arroz5");
    const matchResult = matchProduct({ rawName: "Arroz Branco Tipo 1 Serra Verde 5kg" }, only1kg);
    expect(matchResult.confidence).toBeLessThan(0.75);
  });

  it("devolve none quando nada se parece", () => {
    expect(matchProduct({ rawName: "Pneu aro 15" }, catalog)).toMatchObject({
      kind: "none",
      productId: null,
    });
  });
});

describe("validateObservation", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  it("aceita um preço normal", () => {
    expect(
      validateObservation({ priceCents: 599, unitPriceCents: 599, medianUnitPriceCents: 600, now }),
    ).toEqual([]);
  });
  it("bloqueia validade vencida e duplicata", () => {
    const codes = validateObservation({
      priceCents: 599,
      unitPriceCents: 599,
      validTo: new Date("2026-11-01T00:00:00Z"),
      isDuplicate: true,
      now,
    }).map((issue) => issue.code);
    expect(codes).toEqual(["expired", "duplicate"]);
  });
  it("marca preços fora da mediana para revisão", () => {
    expect(
      validateObservation({
        priceCents: 5000,
        unitPriceCents: 5000,
        medianUnitPriceCents: 1000,
        now,
      })[0]?.code,
    ).toBe("price_outlier_high");
    expect(
      validateObservation({
        priceCents: 100,
        unitPriceCents: 100,
        medianUnitPriceCents: 1000,
        now,
      })[0]?.code,
    ).toBe("price_outlier_low");
  });
  it("rejeita preço inválido", () => {
    expect(validateObservation({ priceCents: 0, unitPriceCents: 0 })[0]?.code).toBe(
      "invalid_price",
    );
  });
  it("mediana", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("decidePublication", () => {
  const sure = { kind: "gtin" as const, productId: "p", confidence: 1, candidates: [] };
  it("publica quando confiança é alta e nada é suspeito", () => {
    expect(decidePublication({ extractionConfidence: 0.95, match: sure, issues: [] }).action).toBe(
      "publish",
    );
  });
  it("usa a MENOR confiança entre extração e casamento", () => {
    const decision = decidePublication({
      extractionConfidence: 0.95,
      match: { ...sure, confidence: 0.7 },
      issues: [],
    });
    expect(decision.action).toBe("review");
    expect(decision.confidence).toBe(0.7);
  });
  it("manda para revisão se há alerta, mesmo com confiança alta", () => {
    const decision = decidePublication({
      extractionConfidence: 0.99,
      match: sure,
      issues: [{ code: "price_outlier_high", severity: "review", message: "caro" }],
    });
    expect(decision.action).toBe("review");
  });
  it("descarta quando há problema bloqueante", () => {
    const decision = decidePublication({
      extractionConfidence: 1,
      match: sure,
      issues: [{ code: "expired", severity: "block", message: "vencido" }],
    });
    expect(decision.action).toBe("reject");
  });
  it("sem produto identificado nunca publica", () => {
    const none = { kind: "none" as const, productId: null, confidence: 0, candidates: [] };
    expect(decidePublication({ extractionConfidence: 1, match: none, issues: [] }).action).toBe(
      "review",
    );
  });
  it("respeita o limiar configurado", () => {
    const lowConfidenceMatch = { ...sure, confidence: 0.85 };
    expect(
      decidePublication({
        extractionConfidence: 1,
        match: lowConfidenceMatch,
        issues: [],
        threshold: 0.8,
      }).action,
    ).toBe("publish");
  });
});

describe("scoreAgainstGolden", () => {
  it("mede precisão por nome + preço e lista os erros", () => {
    const expected = [
      { rawName: "Arroz 5kg", priceCents: 2790 },
      { rawName: "Feijão 1kg", priceCents: 799 },
      { rawName: "Leite 1l", priceCents: 549 },
      { rawName: "Café 500g", priceCents: 1890 },
    ];
    const actual = [
      { rawName: "ARROZ 5KG", priceCents: 2790 },
      { rawName: "Feijao 1kg", priceCents: 899 }, // preço errado
      { rawName: "Leite 1l", priceCents: 549 },
      { rawName: "Sal 1kg", priceCents: 229 }, // não existe no gabarito
    ];
    const report = scoreAgainstGolden(expected, actual);
    expect(report.correct).toBe(2);
    expect(report.accuracy).toBe(0.5);
    expect(report.wrongPrice).toHaveLength(1);
    expect(report.missing.map((item) => item.rawName)).toEqual(["Café 500g"]);
    expect(report.extra.map((item) => item.rawName)).toEqual(["Sal 1kg"]);
  });
});
