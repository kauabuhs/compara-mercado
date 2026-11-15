import { describe, expect, it } from "vitest";
import {
  type ListLine,
  type LocalList,
  MAX_LIST_ITEMS,
  mergeLists,
  resolveListSync,
  type ServerList,
  sameLines,
} from "../list-sync";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const C = "cccccccc-0000-4000-8000-00000000000c";

const line = (productId: string, quantity = 1): ListLine => ({ productId, quantity });
const server = (lines: ListLine[], updatedAt: string | null = "v1"): ServerList => ({
  lines,
  updatedAt,
});
const local = (overrides: Partial<LocalList> & { lines: ListLine[] }): LocalList => ({
  baseUpdatedAt: "v1",
  dirty: false,
  ownerId: ME,
  ...overrides,
});

describe("mergeLists", () => {
  it("une sem repetir produto e fica com a maior quantidade (não soma)", () => {
    expect(mergeLists([line(A, 2), line(B, 1)], [line(B, 3), line(C, 1)])).toEqual([
      line(A, 2),
      line(B, 3),
      line(C, 1),
    ]);
    // sincronizar duas vezes a mesma lista não a dobra
    const once = mergeLists([line(A, 2)], [line(A, 2)]);
    expect(mergeLists(once, [line(A, 2)])).toEqual([line(A, 2)]);
  });

  it("mantém a ordem da primeira lista e limita quantidade e tamanho", () => {
    expect(mergeLists([line(B), line(A)], [line(C)]).map((item) => item.productId)).toEqual([
      B,
      A,
      C,
    ]);
    expect(mergeLists([line(A, 500)], [])).toEqual([line(A, 99)]);
    const many = Array.from({ length: 150 }, (_, i) =>
      line(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`),
    );
    expect(mergeLists(many, [])).toHaveLength(MAX_LIST_ITEMS);
  });
});

describe("sameLines", () => {
  it("compara produto, quantidade e ordem", () => {
    expect(sameLines([line(A, 1), line(B, 2)], [line(A, 1), line(B, 2)])).toBe(true);
    expect(sameLines([line(A, 1), line(B, 2)], [line(B, 2), line(A, 1)])).toBe(false);
    expect(sameLines([line(A, 1)], [line(A, 2)])).toBe(false);
    expect(sameLines([], [])).toBe(true);
  });
});

describe("resolveListSync", () => {
  it("aparelho sem alterações: vale o servidor (traz o que outro aparelho mudou)", () => {
    const decision = resolveListSync(
      server([line(A), line(B, 2)], "v2"),
      local({ lines: [line(A)], baseUpdatedAt: "v1", dirty: false }),
      ME,
    );
    expect(decision).toEqual({ lines: [line(A), line(B, 2)], write: false });
  });

  it("com alterações e o servidor parado: vale o aparelho, inclusive apagar e limpar", () => {
    const edited = resolveListSync(
      server([line(A), line(B)]),
      local({ lines: [line(A, 3)], dirty: true, baseUpdatedAt: "v1" }),
      ME,
    );
    expect(edited).toEqual({ lines: [line(A, 3)], write: true });

    const cleared = resolveListSync(
      server([line(A), line(B)]),
      local({ lines: [], dirty: true, baseUpdatedAt: "v1" }),
      ME,
    );
    expect(cleared).toEqual({ lines: [], write: true });
  });

  it("com alterações e o servidor também alterado por outro aparelho: une, sem perder item", () => {
    const decision = resolveListSync(
      server([line(A), line(C)], "v2"),
      local({ lines: [line(A), line(B)], dirty: true, baseUpdatedAt: "v1" }),
      ME,
    );
    expect(decision.lines.map((item) => item.productId).sort()).toEqual([A, B, C].sort());
    expect(decision.write).toBe(true);
  });

  it("não escreve quando o resultado já é o que o servidor tem", () => {
    const decision = resolveListSync(
      server([line(A, 2)]),
      local({ lines: [line(A, 2)], dirty: true, baseUpdatedAt: "v1" }),
      ME,
    );
    expect(decision.write).toBe(false);
  });

  it("lista montada sem login (nunca sincronizada) é unida à da conta", () => {
    const decision = resolveListSync(
      server([line(A, 1), line(C)]),
      local({ lines: [line(A, 4), line(B)], ownerId: null, baseUpdatedAt: null, dirty: true }),
      ME,
    );
    expect(decision).toEqual({
      lines: [line(A, 4), line(C), line(B)],
      write: true,
    });
  });

  it("primeiro login com conta sem lista: a do aparelho vira a da conta", () => {
    const decision = resolveListSync(
      server([], null),
      local({ lines: [line(A, 2)], ownerId: null, baseUpdatedAt: null, dirty: true }),
      ME,
    );
    expect(decision).toEqual({ lines: [line(A, 2)], write: true });
  });

  it("aparelho que já sincronizou com esta conta e a conta ainda sem lista: grava a do aparelho", () => {
    const decision = resolveListSync(
      server([], null),
      local({ lines: [line(A)], dirty: true, baseUpdatedAt: null }),
      ME,
    );
    expect(decision).toEqual({ lines: [line(A)], write: true });
  });

  it("lista de OUTRA conta no aparelho nunca é misturada: vale a do servidor", () => {
    const decision = resolveListSync(
      server([line(C)]),
      local({ lines: [line(A), line(B)], ownerId: OTHER, dirty: true }),
      ME,
    );
    expect(decision).toEqual({ lines: [line(C)], write: false });
  });

  it("aparelho vazio e nunca sincronizado recebe a lista da conta", () => {
    const decision = resolveListSync(
      server([line(A, 2)]),
      local({ lines: [], ownerId: null, baseUpdatedAt: null, dirty: false }),
      ME,
    );
    expect(decision).toEqual({ lines: [line(A, 2)], write: false });
  });
});
