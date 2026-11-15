import { expect, test } from "@playwright/test";
import { adminAccessToken, apiRequest, createScenario, uniqueName } from "./support/api";
import { hasLocalSupabase } from "./support/session";

// Busca (/busca), "Com preço", paginação, produto (id inválido, histórico) e filtros de /ofertas
// que a suíte de listagens não cobre. Os produtos de teste são criados pela API, como admin, com um
// código único no nome, para a busca achar exatamente eles. Só roda contra o Supabase LOCAL.

test.describe("busca e filtros", () => {
  test.skip(!hasLocalSupabase, "exige o Supabase local");

  const results = (page: import("@playwright/test").Page) =>
    page.locator("main a[href^='/produto/']");

  test("termo curto ou vazio pede mais letras; termo sem resultado tem saída", async ({ page }) => {
    for (const url of ["/busca", "/busca?q=", "/busca?q=a", "/busca?q=%20%20"]) {
      await page.goto(url);
      await expect(page.getByText("O que você quer comprar?"), url).toBeVisible();
    }
    await page.goto("/busca?q=zzzzqqqxxw");
    await expect(page.getByText("Nada encontrado para “zzzzqqqxxw”")).toBeVisible();
    await expect(results(page)).toHaveCount(0);
  });

  test("termo gigante é cortado em 80 letras e não quebra a página", async ({ page }) => {
    await page.goto(`/busca?q=${"a".repeat(300)}`);
    await expect(page.getByRole("combobox").first()).toBeVisible();
    const value = await page
      .getByRole("combobox")
      .first()
      .inputValue()
      .catch(() => "");
    expect(value.length).toBeLessThanOrEqual(80);
    // sem erro de servidor
    await expect(page.getByRole("heading", { name: "Algo deu errado" })).toHaveCount(0);
  });

  test("ignora acento e maiúscula e perdoa erro de digitação", async ({ page }) => {
    await page.goto("/busca?q=FEIJÃO");
    await expect(results(page).filter({ hasText: /feij/i }).first()).toBeVisible();

    await page.goto("/busca?q=feijao");
    await expect(results(page).filter({ hasText: /feij/i }).first()).toBeVisible();

    await page.goto("/busca?q=fijao");
    await expect(results(page).filter({ hasText: /feij/i }).first()).toBeVisible();
  });

  test("caracteres especiais na busca não quebram nem executam", async ({ page }) => {
    const weird = ["<script>window.__xss=1</script>", "' OR 1=1 --", "100% açúcar", "%%", "_ _"];
    for (const term of weird) {
      await page.goto(`/busca?q=${encodeURIComponent(term)}`);
      await expect(page.getByRole("heading", { name: "Algo deu errado" }), term).toHaveCount(0);
    }
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBe(
      undefined,
    );
  });

  test("'Com preço' filtra, o estado vai para a URL e 'Mostrar todos' desfaz", async ({
    page,
  }, info) => {
    const priced = await createScenario("Busca", info.project.name);

    // Segundo produto, sem nenhum preço.
    const admin = await adminAccessToken();
    const category = await apiRequest<{ items: Array<{ id: string }> }>(
      admin,
      "GET",
      "/v1/admin/categories?pageSize=1",
    );
    const unpriced = await apiRequest<{ id: string }>(admin, "POST", "/v1/admin/products", {
      name: priced.productName.replace("Produto", "Semprecio"),
      categoryId: category.body.items[0]?.id ?? null,
      sizeValue: 2,
      sizeUnit: "kg",
    });
    expect(unpriced.status).toBe(201);
    await apiRequest(admin, "POST", "/v1/admin/prices", {
      storeId: priced.storeId,
      productId: priced.productId,
      priceCents: 999,
      promo: false,
    });

    // Cada produto é achado pelo próprio nome (único); o filtro só deixa o que tem preço.
    const pricedName = priced.productName;
    const unpricedName = priced.productName.replace("Produto", "Semprecio");

    await page.goto(`/busca?q=${encodeURIComponent(unpricedName)}`);
    await expect(results(page).filter({ hasText: unpricedName })).toHaveCount(1);

    await page.goto(`/busca?q=${encodeURIComponent(unpricedName)}&comPreco=1`);
    await expect(page.getByText("Nenhum resultado com preço")).toBeVisible();
    await page.getByRole("link", { name: "Mostrar todos" }).click();
    await expect(page).not.toHaveURL(/comPreco/);
    await expect(results(page).filter({ hasText: unpricedName })).toHaveCount(1);

    await page.goto(`/busca?q=${encodeURIComponent(pricedName)}`);
    const chip = page.getByRole("link", { name: /Com preço/ });
    await expect(results(page).filter({ hasText: pricedName })).toHaveCount(1);
    await chip.click();
    await expect(page).toHaveURL(/comPreco=1/);
    await expect(page.getByRole("link", { name: /Com preço/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(results(page).filter({ hasText: pricedName })).toHaveCount(1);
  });

  test("busca paginada: página 2, página além do fim volta para a última", async ({ page }) => {
    // "de" casa com dezenas de produtos (mais que as 20 de uma página)
    await page.goto("/busca?q=de");
    const total = await page
      .locator("[aria-live='polite']")
      .filter({ hasText: /resultados?$/ })
      .first()
      .textContent();
    const count = Number((total ?? "0").replace(/\D/g, ""));
    test.skip(count <= 20, "poucos resultados para paginar neste banco");

    await expect(page.getByRole("navigation", { name: /pagina/i }).first()).toBeVisible();
    await page.goto("/busca?q=de&pagina=2");
    await expect(results(page).first()).toBeVisible();

    await page.goto("/busca?q=de&pagina=9999");
    await expect(page).toHaveURL(/pagina=\d+/);
    await expect(results(page).first()).toBeVisible();
    const last = Number(new URL(page.url()).searchParams.get("pagina"));
    expect(last).toBeLessThan(9999);
    expect(last).toBeGreaterThanOrEqual(2);
  });

  test("produto: id inválido e inexistente mostram 'não encontrada'", async ({ page }) => {
    for (const id of ["nao-e-uuid", "00000000-0000-4000-8000-000000000000"]) {
      const response = await page.goto(`/produto/${id}`);
      await expect(page.getByText("Página não encontrada"), id).toBeVisible();
      // QA-012: a página usa streaming (loading.tsx), então o HTTP já saiu como 200 quando o
      // `notFound()` roda: é um "soft 404" (a pessoa vê a tela certa, mas robôs recebem 200).
      expect(response?.status(), id).toBe(200);
    }
    const unknownRoute = await page.goto("/rota-que-nao-existe");
    expect(unknownRoute?.status()).toBe(404);
  });

  test("produto com dois preços mostra o mais barato e o histórico com 30 e 90 dias", async ({
    page,
  }, info) => {
    const one = await createScenario("Hist A", info.project.name);
    const admin = await adminAccessToken();
    const store2 = await apiRequest<{ id: string }>(admin, "POST", "/v1/admin/stores", {
      name: uniqueName("Mercado Hist B", info.project.name),
      cityId: "10000000-0000-4000-8000-000000000001",
      lat: -29.18,
      lng: -51.19,
      status: "active",
    });
    for (const [storeId, priceCents] of [
      [one.storeId, 1500],
      [store2.body.id, 1200],
      [one.storeId, 1400],
    ] as const) {
      const response = await apiRequest(admin, "POST", "/v1/admin/prices", {
        storeId,
        productId: one.productId,
        priceCents,
        promo: false,
      });
      expect(response.status).toBe(201);
    }

    await page.goto(`/produto/${one.productId}`);
    await expect(page.getByRole("heading", { name: one.productName })).toBeVisible();
    // dois mercados: o mais barato (R$ 12,00) leva o selo
    await expect(page.getByText("mais barato")).toBeVisible();
    await expect(page.getByText("R$ 12,00").first()).toBeVisible();

    // histórico (há mais de um ponto): seletor 30/90 dias
    await expect(page.getByRole("heading", { name: /Histórico/ })).toBeVisible();
    const period = page.getByRole("radiogroup").filter({ hasText: "30 dias" });
    await expect(period.getByRole("radio", { name: "90 dias" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await period.getByRole("radio", { name: "30 dias" }).click();
    await expect(period.getByRole("radio", { name: "30 dias" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("ofertas: 'loja' inválida na URL não quebra e 'Vence em breve' filtra por validade", async ({
    page,
  }, info) => {
    await page.goto("/ofertas?loja=nao-e-uuid");
    await expect(page.getByRole("heading", { name: "Algo deu errado" })).toHaveCount(0);
    await expect(results(page).first()).toBeVisible();

    const scenario = await createScenario("Vence", info.project.name);
    const tomorrow = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const created = await apiRequest(await adminAccessToken(), "POST", "/v1/admin/prices", {
      storeId: scenario.storeId,
      productId: scenario.productId,
      priceCents: 777,
      promo: true,
      validTo: tomorrow,
    });
    expect(created.status).toBe(201);

    // A lista de ofertas fica em cache por até 60 s na API (QA-004): repete até aparecer.
    await expect(async () => {
      await page.goto(`/ofertas?q=${encodeURIComponent(scenario.productName)}&vence=1`);
      await expect(page.getByRole("button", { name: "Vence em breve" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(results(page).filter({ hasText: scenario.productName })).toHaveCount(1, {
        timeout: 2_000,
      });
    }).toPass({ timeout: 90_000, intervals: [3_000] });
  });
});
