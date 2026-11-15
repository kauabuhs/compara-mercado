import { describe, expect, it } from "vitest";
import { formatPhoneForDisplay } from "../phone";

describe("formatPhoneForDisplay", () => {
  it.each([
    ["+5554999990000", "(54) 99999-0000"],
    ["+555432221111", "(54) 3222-1111"],
    ["+14155552671", "+14155552671"],
    ["", ""],
  ])("formata %s como %s", (input, expected) => {
    expect(formatPhoneForDisplay(input)).toBe(expected);
  });

  it("devolve vazio para nulo", () => {
    expect(formatPhoneForDisplay(null)).toBe("");
  });
});
