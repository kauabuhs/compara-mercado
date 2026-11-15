import { describe, expect, it } from "vitest";
import { decodeFeedCursor, encodeFeedCursor } from "../cursor";

const cursor = {
  createdAt: "2026-11-13T12:00:00.123456+00:00",
  id: "9d1c1e0a-7f0c-4b0e-8f4e-5d3d2d0a1b22",
};

const raw = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

describe("cursor do feed", () => {
  it("ida e volta preserva o instante (com microssegundos) e o id", () => {
    expect(decodeFeedCursor(encodeFeedCursor(cursor))).toEqual(cursor);
  });

  it("é opaco e seguro para URL", () => {
    expect(encodeFeedCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ["texto qualquer", "lixo"],
    ["vazio", ""],
    ["json que não é lista", raw({ a: 1 })],
    ["lista curta", raw(["2026-11-13T12:00:00Z"])],
    ["data inválida", raw(["ontem", cursor.id])],
    ["id que não é uuid", raw([cursor.createdAt, "1; drop table"])],
    ["tipos errados", raw([1, 2])],
  ])("recusa cursor malformado: %s", (_label, value) => {
    expect(decodeFeedCursor(value)).toBeNull();
  });
});
