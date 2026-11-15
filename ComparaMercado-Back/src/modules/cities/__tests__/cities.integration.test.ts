import { beforeAll, describe, expect, it } from "vitest";
import { createAnonClient } from "../../../database/supabase";
import type { CitiesService } from "../cities.types";
import { createCitiesRepository } from "../repository/cities.repository";
import { createCitiesService } from "../service/cities.service";

// Roda contra o Supabase LOCAL com o seed (`pnpm db:start`). Fica ignorado sem as variáveis.
//   SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_ANON_KEY=<anon> pnpm test
const url = process.env["SUPABASE_TEST_URL"];
const key = process.env["SUPABASE_TEST_ANON_KEY"];

const CAXIAS_ID = "10000000-0000-4000-8000-000000000001";
const PASSO_FUNDO_ID = "10000000-0000-4000-8000-000000000002";

describe.skipIf(!url || !key)("biblioteca de cidades no Supabase local (como visitante)", () => {
  let cities: CitiesService;
  beforeAll(() => {
    // O corpo do describe roda mesmo quando ignorado: só cria o cliente se houver variáveis
    cities = createCitiesService(createCitiesRepository(createAnonClient(url ?? "", key ?? "")));
  });

  it("acha a cidade por nome, sem acento, em qualquer caixa e com erro de digitação", async () => {
    for (const q of ["caxias do sul", "CAXIAS DO SUL", "xaxias do sul"]) {
      const found = await cities.search({ q, uf: "RS", limit: 5 });
      expect(found[0], q).toMatchObject({ id: CAXIAS_ID, uf: "RS", ibgeCode: "4305108" });
    }
    const accent = await cities.search({ q: "sao paulo", uf: "SP", limit: 5 });
    expect(accent[0]?.name).toBe("São Paulo");
  });

  it("cidade com mercados está disponível; sem mercados fica 'em breve'", async () => {
    const caxias = await cities.get(CAXIAS_ID);
    expect(caxias).toMatchObject({ coverage: "available", storeCount: 6 });

    const passoFundo = await cities.get(PASSO_FUNDO_ID);
    expect(passoFundo).toMatchObject({ coverage: "coming_soon", storeCount: 0 });
  });

  it("sem texto, devolve só as cidades que já têm mercados", async () => {
    const shortcuts = await cities.search({ q: "", limit: 20 });
    expect(shortcuts.map((city) => city.id)).toContain(CAXIAS_ID);
    expect(shortcuts.every((city) => city.storeCount > 0)).toBe(true);
  });

  it("com UF e sem texto, lista a UF (as cidades com mercados primeiro)", async () => {
    const list = await cities.search({ q: "", uf: "RS", limit: 50 });
    expect(list).toHaveLength(50);
    expect(list.every((city) => city.uf === "RS")).toBe(true);
    expect(list[0]?.id).toBe(CAXIAS_ID);
  });

  it("a biblioteca tem os municípios do IBGE, inclusive os desabilitados", async () => {
    const found = await cities.search({ q: "panambi", limit: 5 });
    expect(found[0]).toMatchObject({ name: "Panambi", uf: "RS", coverage: "coming_soon" });
  });

  it("cidade inexistente devolve null", async () => {
    expect(await cities.get("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
