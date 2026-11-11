import { describe, expect, it } from "vitest";
import { CompareListRequestSchema } from "./index";

const id = "6f1b1b0e-5b0e-4b7a-9d57-2d6f6c2a7e11";

describe("CompareListRequestSchema", () => {
  it("aceita lista válida com e sem localização", () => {
    expect(
      CompareListRequestSchema.safeParse({ items: [{ productId: id, quantity: 2 }] }).success,
    ).toBe(true);
    expect(
      CompareListRequestSchema.safeParse({
        items: [{ productId: id, quantity: 1 }],
        where: { lat: -29.17, lng: -51.18 },
      }).success,
    ).toBe(true);
  });

  it.each([
    ["lista vazia", { items: [] }],
    ["quantidade zero", { items: [{ productId: id, quantity: 0 }] }],
    ["quantidade fracionada", { items: [{ productId: id, quantity: 1.5 }] }],
    ["id inválido", { items: [{ productId: "x", quantity: 1 }] }],
    [
      "latitude fora da faixa",
      { items: [{ productId: id, quantity: 1 }], where: { lat: 91, lng: 0 } },
    ],
    [
      "mais de 100 itens",
      { items: Array.from({ length: 101 }, () => ({ productId: id, quantity: 1 })) },
    ],
  ])("rejeita %s", (_nome, entrada) => {
    expect(CompareListRequestSchema.safeParse(entrada).success).toBe(false);
  });
});
