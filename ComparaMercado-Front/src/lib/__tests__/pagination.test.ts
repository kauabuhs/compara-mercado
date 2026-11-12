import { describe, expect, it } from "vitest";
import { clampPage, pageRange, pageWindow, parsePage, totalPages } from "../pagination";

describe("parsePage", () => {
  it("aceita inteiros positivos", () => {
    expect(parsePage("1")).toBe(1);
    expect(parsePage("7")).toBe(7);
    expect(parsePage(["3", "9"])).toBe(3);
  });

  it("qualquer valor estranho vira a página 1", () => {
    for (const raw of [
      undefined,
      null,
      "",
      "0",
      "-2",
      "abc",
      "2.5",
      "1e3",
      " 4",
      "99999",
      "007x",
    ]) {
      expect(parsePage(raw)).toBe(1);
    }
  });
});

describe("totalPages", () => {
  it("arredonda para cima e nunca é menor que 1", () => {
    expect(totalPages(0, 20)).toBe(1);
    expect(totalPages(20, 20)).toBe(1);
    expect(totalPages(21, 20)).toBe(2);
    expect(totalPages(1284, 20)).toBe(65);
  });
});

describe("clampPage", () => {
  it("mantém a página dentro do intervalo válido", () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(9, 5)).toBe(5);
    expect(clampPage(3, 5)).toBe(3);
    expect(clampPage(3, 0)).toBe(1);
  });
});

describe("pageRange", () => {
  it("devolve o intervalo mostrado, com a última página parcial", () => {
    expect(pageRange(1, 20, 1284)).toEqual({ from: 1, to: 20 });
    expect(pageRange(2, 20, 1284)).toEqual({ from: 21, to: 40 });
    expect(pageRange(65, 20, 1284)).toEqual({ from: 1281, to: 1284 });
    expect(pageRange(1, 20, 0)).toEqual({ from: 0, to: 0 });
  });
});

describe("pageWindow", () => {
  it("poucas páginas: mostra todas", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("muitas páginas: primeira, última, atual e vizinhas, com reticências", () => {
    expect(pageWindow(1, 40)).toEqual([1, 2, "ellipsis", 40]);
    expect(pageWindow(6, 40)).toEqual([1, "ellipsis", 5, 6, 7, "ellipsis", 40]);
    expect(pageWindow(40, 40)).toEqual([1, "ellipsis", 39, 40]);
  });

  it("lacuna de uma só página mostra o número em vez de reticências", () => {
    expect(pageWindow(4, 40)).toEqual([1, 2, 3, 4, 5, "ellipsis", 40]);
    expect(pageWindow(37, 40)).toEqual([1, "ellipsis", 36, 37, 38, 39, 40]);
  });

  it("página fora do intervalo é ajustada", () => {
    expect(pageWindow(99, 10)).toEqual([1, "ellipsis", 9, 10]);
  });
});
