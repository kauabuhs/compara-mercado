import { compareList as compareListDomain } from "@compara/domain";
import { beforeAll, describe, expect, it } from "vitest";
import { createAnonClient, type Db } from "./client";
import {
  compareList,
  getPriceHistory,
  getProductPrices,
  listOffers,
  listStores,
  searchProducts,
} from "./queries";

// Roda contra o Supabase LOCAL com o seed (`pnpm db:start`). Fica ignorado sem as variáveis.
//   SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_ANON_KEY=<anon> pnpm test
const url = process.env["SUPABASE_TEST_URL"];
const key = process.env["SUPABASE_TEST_ANON_KEY"];

describe.skipIf(!url || !key)(
  "integração com o Supabase local (somente leitura, como anon)",
  () => {
    let db: Db;
    beforeAll(() => {
      // O corpo do describe roda mesmo quando ignorado: só cria o cliente se houver variáveis
      db = createAnonClient(url ?? "", key ?? "");
    });

    it("lista os 6 mercados do seed com coordenadas", async () => {
      const stores = await listStores(db);
      expect(stores).toHaveLength(6);
      expect(stores[0]?.lat).toBeLessThan(-29);
      expect(stores[0]?.lng).toBeLessThan(-51);
    });

    it("busca tolera erro de digitação e acento", async () => {
      const hits = await searchProducts(db, "feijao");
      expect(hits.map((hit) => hit.name)).toEqual(
        expect.arrayContaining(["Feijão preto", "Feijão carioca"]),
      );
      const typo = await searchProducts(db, "arroz parboilisado");
      expect(typo[0]?.name).toBe("Arroz parboilizado");
    });

    it("devolve preços por mercado ordenados pelo preço por unidade base", async () => {
      const [arroz] = await searchProducts(db, "arroz branco");
      expect(arroz).toBeDefined();
      const prices = await getProductPrices(db, arroz?.productId ?? "");
      expect(prices.length).toBeGreaterThanOrEqual(4);
      const units = prices.map((price) => price.unitPriceCents);
      expect(units).toEqual([...units].sort((a, b) => a - b));
      expect(arroz?.minUnitPriceCents).toBe(units[0]);
    });

    it("lista ofertas e histórico sem expor contribuidores", async () => {
      const offers = await listOffers(db);
      expect(offers.every((offer) => offer.promo)).toBe(true);
      const [leite] = await searchProducts(db, "leite integral");
      const history = await getPriceHistory(db, leite?.productId ?? "");
      expect(history.length).toBeGreaterThan(0);
      expect(Object.keys(history[0] ?? {})).not.toContain("createdBy");
    });

    it("compare_list no SQL bate com compareList do domínio (paridade)", async () => {
      const names = ["arroz branco", "feijao preto", "leite integral", "cafe", "banana"];
      const items = [];
      for (const n of names) {
        const [hit] = await searchProducts(db, n, 1);
        if (hit) items.push({ productId: hit.productId, quantity: 2 });
      }
      expect(items).toHaveLength(5);

      const sqlComparison = await compareList(db, items);
      expect(sqlComparison.bestSingle).not.toBeNull();

      // Reconstrói a mesma comparação em TypeScript a partir do price_board
      const board = (
        await Promise.all(items.map((item) => getProductPrices(db, item.productId)))
      ).flat();
      const stores = await listStores(db);
      const domainComparison = compareListDomain(
        items,
        board.map((boardRow) => ({
          storeId: boardRow.storeId,
          productId: boardRow.productId,
          priceCents: boardRow.priceCents,
        })),
        stores.map((store) => ({ storeId: store.id })),
      );

      expect(sqlComparison.stores.map((store) => [store.storeId, store.totalCents])).toEqual(
        domainComparison.stores.map((store) => [store.storeId, store.totalCents]),
      );
      expect(sqlComparison.bestSingle?.storeId).toBe(domainComparison.bestSingle?.storeId);
      expect(sqlComparison.bestSplit?.totalCents).toBe(domainComparison.bestSplit?.totalCents);
      expect(sqlComparison.bestSplit?.savingsCents).toBe(domainComparison.bestSplit?.savingsCents);
    });
  },
);
