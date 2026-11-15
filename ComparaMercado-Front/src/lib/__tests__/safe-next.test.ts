import { describe, expect, it } from "vitest";
import { DEFAULT_NEXT_PATH, safeNextPath } from "../safe-next";

describe("safeNextPath", () => {
  it.each([
    "/conta",
    "/conta/perfil",
    "/conta/reputacao",
    "/comunidade",
    "/contribuir",
    "/admin",
    "/admin/revisao",
    "/admin/precos",
    "/lista",
    "/nova-senha",
    "/",
  ])("aceita o caminho interno %s", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it("descarta query e fragmento, mantendo só o caminho", () => {
    expect(safeNextPath("/admin/revisao?page=2#topo")).toBe("/admin/revisao");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "/%2F%2Fevil.example",
    "/admin/../../etc/passwd",
    "/conta\nSet-Cookie: x=1",
    "/rota-que-nao-existe",
    "conta",
    "",
  ])("recusa %j e cai no destino padrão", (candidate) => {
    expect(safeNextPath(candidate)).toBe(DEFAULT_NEXT_PATH);
  });

  it.each([null, undefined, 42, ["/admin"], {}])("recusa valor que não é texto: %j", (value) => {
    expect(safeNextPath(value)).toBe(DEFAULT_NEXT_PATH);
  });

  it("usa o destino de reserva informado", () => {
    expect(safeNextPath("https://evil.example", "/")).toBe("/");
  });
});
