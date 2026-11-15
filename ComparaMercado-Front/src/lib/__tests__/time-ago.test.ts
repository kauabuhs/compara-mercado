import { describe, expect, it } from "vitest";
import { formatTimeAgo } from "../format";

const NOW = Date.parse("2026-11-13T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatTimeAgo", () => {
  it.each([
    [0, "agora"],
    [59_000, "agora"],
    [MIN, "há 1 min"],
    [12 * MIN, "há 12 min"],
    [59 * MIN, "há 59 min"],
    [HOUR, "há 1 h"],
    [5 * HOUR + 30 * MIN, "há 5 h"],
    [23 * HOUR, "há 23 h"],
    [DAY, "há 1 dia"],
    [3 * DAY, "há 3 dias"],
  ])("%i ms atrás → %s", (elapsed, expected) => {
    expect(formatTimeAgo(ago(elapsed), NOW)).toBe(expected);
  });

  it("relógio do aparelho adiantado não mostra tempo negativo", () => {
    expect(formatTimeAgo(new Date(NOW + 5 * MIN).toISOString(), NOW)).toBe("agora");
  });

  it("data inválida vira texto vazio, nunca 'NaN'", () => {
    expect(formatTimeAgo("ontem", NOW)).toBe("");
  });
});
