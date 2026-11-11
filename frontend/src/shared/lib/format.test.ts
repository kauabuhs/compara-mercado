import { describe, expect, it } from "vitest";
import { formatDistance, formatSize, formatValidUntil } from "./format";

describe("format", () => {
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
