import { describe, expect, it } from "vitest";
import { clientIpFromForwardedFor } from "./client-ip";

describe("clientIpFromForwardedFor", () => {
  it("usa o valor único quando o proxy sobrescreve o header", () => {
    expect(clientIpFromForwardedFor("203.0.113.7")).toBe("203.0.113.7");
  });

  it("ignora o que o cliente forjou à esquerda e usa o IP acrescentado pelo proxy", () => {
    expect(clientIpFromForwardedFor("1.2.3.4, 203.0.113.7")).toBe("203.0.113.7");
    expect(clientIpFromForwardedFor("9.9.9.9, 1.2.3.4, 203.0.113.7")).toBe("203.0.113.7");
  });

  it("respeita mais de um proxy confiável (CDN + balanceador)", () => {
    expect(clientIpFromForwardedFor("1.2.3.4, 203.0.113.7, 10.0.0.5", 2)).toBe("203.0.113.7");
  });

  it("não estoura quando há menos entradas que proxies confiáveis", () => {
    expect(clientIpFromForwardedFor("203.0.113.7", 3)).toBe("203.0.113.7");
  });

  it("cai para 'local' sem header ou com header vazio", () => {
    expect(clientIpFromForwardedFor(null)).toBe("local");
    expect(clientIpFromForwardedFor("")).toBe("local");
    expect(clientIpFromForwardedFor(" , ")).toBe("local");
  });

  it("trata hops inválidos como 1", () => {
    expect(clientIpFromForwardedFor("1.2.3.4, 203.0.113.7", 0)).toBe("203.0.113.7");
    expect(clientIpFromForwardedFor("1.2.3.4, 203.0.113.7", Number.NaN)).toBe("203.0.113.7");
  });
});
