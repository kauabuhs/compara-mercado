import { describe, expect, it } from "vitest";
import { pageOffset } from "../pagination";

describe("pageOffset", () => {
  it("a primeira página começa em 0", () => {
    expect(pageOffset(1, 20)).toBe(0);
  });

  it("avança pelo tamanho da página", () => {
    expect(pageOffset(2, 20)).toBe(20);
    expect(pageOffset(5, 10)).toBe(40);
  });

  it("nunca devolve deslocamento negativo", () => {
    expect(pageOffset(0, 20)).toBe(0);
    expect(pageOffset(-3, 20)).toBe(0);
  });
});
