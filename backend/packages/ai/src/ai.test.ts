import { describe, expect, it } from "vitest";
import {
  BudgetGuard,
  estimateCostUsdCents,
  extractJsonObject,
  FakeVisionProvider,
  parseFlyerExtraction,
} from "./index";

const valid = {
  storeName: "Mercado Centro",
  periodStart: "2026-11-09",
  periodEnd: "2026-11-15",
  items: [
    {
      rawName: "Arroz Branco 5kg",
      sizeText: "5kg",
      priceCents: 2790,
      promo: true,
      confidence: 0.97,
    },
  ],
};

describe("parseFlyerExtraction", () => {
  it("aceita JSON válido e preenche padrões", () => {
    const parseResult = parseFlyerExtraction(JSON.stringify(valid));
    expect(parseResult.ok).toBe(true);
    if (parseResult.ok) {
      expect(parseResult.data.items[0]?.brand).toBeNull();
      expect(parseResult.data.items[0]?.gtin).toBeNull();
    }
  });

  it("tolera cerca de markdown e texto em volta", () => {
    const parseResult = parseFlyerExtraction(
      `Aqui está:\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\`\nFim.`,
    );
    expect(parseResult.ok).toBe(true);
  });

  it("rejeita preço em reais (float) e confiança fora de 0..1", () => {
    const bad = { items: [{ rawName: "X", priceCents: 5.99, confidence: 1.5 }] };
    const parseResult = parseFlyerExtraction(JSON.stringify(bad));
    expect(parseResult.ok).toBe(false);
    if (!parseResult.ok) expect(parseResult.error).toContain("fora do schema");
  });

  it("rejeita data em formato errado e texto sem JSON", () => {
    expect(
      parseFlyerExtraction(
        JSON.stringify({
          items: [{ rawName: "X", priceCents: 100, confidence: 1, validTo: "15/11/2026" }],
        }),
      ).ok,
    ).toBe(false);
    expect(parseFlyerExtraction("desculpe, não consegui").ok).toBe(false);
    expect(() => extractJsonObject("sem json")).toThrow();
  });
});

describe("FakeVisionProvider", () => {
  it("devolve a extração configurada e registra as chamadas", async () => {
    const parsed = parseFlyerExtraction(JSON.stringify(valid));
    if (!parsed.ok) throw new Error("fixture inválida");
    const fake = new FakeVisionProvider(parsed.data);
    const out = await fake.extractFlyer({ bytes: new Uint8Array([1]), mimeType: "image/png" });
    expect(out.data.items).toHaveLength(1);
    expect(fake.calls).toHaveLength(1);
  });
});

describe("custo", () => {
  it("estima em centavos de dólar", () => {
    // 100k tokens in + 10k out no Opus 5.5: 0,40 + 0,20 = US$ 0,60 = 60 centavos
    expect(
      estimateCostUsdCents("claude-opus-5-5", { inputTokens: 100_000, outputTokens: 10_000 }),
    ).toBeCloseTo(60);
  });
  it("falha alto em modelo sem preço", () => {
    expect(() => estimateCostUsdCents("modelo-x", { inputTokens: 1, outputTokens: 1 })).toThrow();
  });
  it("BudgetGuard trava no teto e alerta perto dele", () => {
    const budgetGuard = new BudgetGuard(1000);
    expect(budgetGuard.canSpend(500)).toBe(true);
    budgetGuard.record(850);
    expect(budgetGuard.nearLimit()).toBe(true);
    expect(budgetGuard.canSpend(200)).toBe(false);
    expect(budgetGuard.remaining).toBe(150);
  });
});
