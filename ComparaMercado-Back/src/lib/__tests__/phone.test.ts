import { describe, expect, it } from "vitest";
import { normalizePhone } from "../phone";

describe("normalizePhone", () => {
  it.each([
    ["(54) 99999-0000", "+5554999990000"],
    ["54999990000", "+5554999990000"],
    ["054 99999 0000", "+5554999990000"],
    ["(54) 3222-1111", "+555432221111"],
    ["5554999990000", "+5554999990000"],
    ["+55 54 99999-0000", "+5554999990000"],
    ["+1 415 555 2671", "+14155552671"],
  ])("normaliza %s para %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("texto vazio apaga o telefone", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
  });

  it.each(["abc", "99999-000", "(54) 9999", "+0 123 456 7890", "54 99999-0000 ramal 12", "+55"])(
    "recusa %s",
    (input) => {
      expect(normalizePhone(input)).toBeUndefined();
    },
  );
});
