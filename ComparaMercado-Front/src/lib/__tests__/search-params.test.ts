import { describe, expect, it } from "vitest";
import { withParams } from "../search-params";

describe("withParams", () => {
  it("adiciona e troca parâmetros preservando os demais", () => {
    expect(withParams("q=leite&pagina=3", { pagina: 4 })).toBe("?q=leite&pagina=4");
    expect(withParams("q=leite", { loja: "abc" })).toBe("?q=leite&loja=abc");
  });

  it("null, undefined e vazio removem o parâmetro", () => {
    expect(withParams("q=leite&pagina=3", { pagina: null })).toBe("?q=leite");
    expect(withParams("q=leite&pagina=3", { pagina: undefined })).toBe("?q=leite");
    expect(withParams("q=leite&pagina=3", { q: "" })).toBe("?pagina=3");
  });

  it("devolve string vazia quando não sobra nada (sem '?' sobrando)", () => {
    expect(withParams("pagina=2", { pagina: null })).toBe("");
    expect(withParams("", {})).toBe("");
  });

  it("aceita URLSearchParams e escapa o valor", () => {
    expect(withParams(new URLSearchParams("a=1"), { q: "café com leite" })).toBe(
      "?a=1&q=caf%C3%A9+com+leite",
    );
  });
});
