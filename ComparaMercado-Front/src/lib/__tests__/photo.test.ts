import { describe, expect, it } from "vitest";
import { fitWithin, MAX_PHOTO_SIDE_PX } from "../photo";

describe("fitWithin", () => {
  it("reduz pelo lado maior, mantendo a proporção", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(4032, 3024, MAX_PHOTO_SIDE_PX)).toEqual({ width: 1600, height: 1200 });
  });

  it("nunca amplia nem altera o que já cabe", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  it("não produz dimensão zero em imagens muito estreitas", () => {
    const { width, height } = fitWithin(10_000, 1, 1600);
    expect(width).toBe(1600);
    expect(height).toBeGreaterThanOrEqual(1);
  });
});
