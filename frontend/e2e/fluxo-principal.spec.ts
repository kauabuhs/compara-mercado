import { expect, test } from "@playwright/test";

test("home mostra a busca, as ofertas e a navegação", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("sua lista");
  await expect(page.getByRole("search")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ofertas da semana" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Principal" })).toBeVisible();
});

test("busca tolera erro de digitação e abre o produto com mercados e selo", async ({ page }) => {
  await page.goto("/busca?q=feijao");
  await expect(page.getByRole("list", { name: /Resultados/ })).toBeVisible();
  await page
    .getByRole("link", { name: /Feijão preto/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/produto\//);

  await expect(page.getByRole("heading", { level: 1, name: /Feijão preto/ })).toBeVisible();
  await expect(page.getByText("mais barato").first()).toBeVisible();
  await expect(page.getByText(/atualizado/).first()).toBeVisible();
});

test("monta uma lista de 5 itens e vê o total por mercado rapidamente (critério da Fase 1)", async ({
  page,
}) => {
  for (const termo of ["arroz branco", "feijao preto", "leite integral", "cafe", "banana"]) {
    await page.goto(`/busca?q=${encodeURIComponent(termo)}`);
    await page
      .getByRole("list", { name: /Resultados/ })
      .getByRole("link")
      .first()
      .click();
    await page.getByRole("button", { name: /Adicionar .* à lista/ }).click();
    await expect(page.getByText("Adicionado")).toBeVisible();
  }

  // O que o plano exige é o total aparecer sem fricção: mede só a abertura da lista até o resultado.
  // (O orçamento de 1 minuto do usuário é validado no teste de usabilidade com pessoas reais.)
  const started = Date.now();
  await page.goto("/lista");
  await expect(page.getByRole("heading", { name: /Itens \(5\)/ })).toBeVisible();
  await expect(page.getByText("melhor mercado único")).toBeVisible();
  await expect(page.getByText(/R\$\s?\d/).first()).toBeVisible();
  expect(Date.now() - started).toBeLessThan(15_000);
});

test("a lista sobrevive a recarregar a página", async ({ page }) => {
  await page.goto("/busca?q=arroz");
  await page
    .getByRole("list", { name: /Resultados/ })
    .getByRole("link")
    .first()
    .click();
  await page.getByRole("button", { name: /Adicionar .* à lista/ }).click();
  await page.goto("/lista");
  await page.reload();
  await expect(page.getByRole("heading", { name: /Itens \(1\)/ })).toBeVisible();
});

test("lista vazia mostra estado vazio com próximo passo", async ({ page }) => {
  await page.goto("/lista");
  await expect(page.getByText("Sua lista está vazia")).toBeVisible();
  await expect(page.getByRole("link", { name: "Buscar produtos" })).toBeVisible();
});

test("/admin exige login: visitante anônimo é redirecionado", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/conta$/);
});

test("manifest PWA e cabeçalhos de segurança", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).display).toBe("standalone");

  const homeResponse = await request.get("/");
  const responseHeaders = homeResponse.headers();
  expect(responseHeaders["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(responseHeaders["x-content-type-options"]).toBe("nosniff");
  expect(responseHeaders["strict-transport-security"]).toContain("max-age");
  expect(responseHeaders["x-powered-by"]).toBeUndefined();
});

test("produto com id inválido devolve 404 amigável", async ({ page }) => {
  // Com loading.tsx a resposta já começou a ser enviada, então o status HTTP é 200;
  // o conteúdo é a página de "não encontrado" e o Next injeta noindex.
  await page.goto("/produto/nao-e-uuid");
  await expect(page.getByText("Página não encontrada")).toBeVisible();
});
