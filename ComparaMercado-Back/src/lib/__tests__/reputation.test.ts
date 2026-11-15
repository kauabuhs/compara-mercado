import { describe, expect, it } from "vitest";
import { nextLevelAt, REPUTATION_LEVEL_THRESHOLDS, reputationLevel } from "../reputation";

describe("reputationLevel", () => {
  it.each([
    [0, 0],
    [49, 0],
    [50, 1],
    [199, 1],
    [200, 2],
    [599, 2],
    [600, 3],
    [100_000, 3],
  ])("%i pontos → nível %i", (points, level) => {
    expect(reputationLevel(points)).toBe(level);
  });

  it("pontos negativos ou fracionados não quebram", () => {
    expect(reputationLevel(-30)).toBe(0);
    expect(reputationLevel(49.9)).toBe(0);
    expect(reputationLevel(50.9)).toBe(1);
  });
});

describe("nextLevelAt", () => {
  it("aponta o limiar do nível seguinte e some no último", () => {
    expect(nextLevelAt(0)).toBe(50);
    expect(nextLevelAt(60)).toBe(200);
    expect(nextLevelAt(250)).toBe(600);
    expect(nextLevelAt(600)).toBeNull();
  });

  it("as faixas são as mesmas do banco (public.reputation_level)", () => {
    expect(REPUTATION_LEVEL_THRESHOLDS).toEqual([0, 50, 200, 600]);
  });
});
