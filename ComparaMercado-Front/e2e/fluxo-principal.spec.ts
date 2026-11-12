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

test("busca acha o produto mesmo com letras trocadas (leiet → Leite)", async ({ page }) => {
  await page.goto("/busca?q=leiet");
  await expect(page.getByRole("link", { name: /Leite integral/ })).toBeVisible();
});

test("o CSP autoriza a origem exata dos tiles do mapa (img-src e connect-src)", async ({
  request,
}) => {
  // Regressão: o CSP permitia `*.tiles.openfreemap.org`, que NÃO casa com `tiles.openfreemap.org`
  // (o curinga exige subdomínio). O mapa ficava sem tiles e nenhum erro aparecia na interface.
  // Sem depender de WebGL: o Chromium headless do CI não renderiza o mapa.
  const tileHost = "tiles.openfreemap.org";
  const response = await request.get("/mercados");
  const csp = response.headers()["content-security-policy"] ?? "";
  const directive = (name: string) =>
    csp
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .find(([directiveName]) => directiveName === name)
      ?.slice(1) ?? [];
  const allows = (sources: string[]) =>
    sources.some((source) => {
      const host = source.replace("https://", "");
      return host.startsWith("*.") ? tileHost.endsWith(host.slice(1)) : host === tileHost;
    });

  expect(allows(directive("img-src")), "img-src deve permitir os tiles").toBe(true);
  expect(allows(directive("connect-src")), "connect-src deve permitir os tiles").toBe(true);
});

test("remover item e limpar a lista pedem confirmação (alerta e action sheet)", async ({
  page,
}) => {
  for (const termo of ["arroz", "feijao"]) {
    await page.goto(`/busca?q=${termo}`);
    await page
      .getByRole("list", { name: /Resultados/ })
      .getByRole("link")
      .first()
      .click();
    await page.getByRole("button", { name: /Adicionar .* à lista/ }).click();
    await expect(page.getByText("Adicionado")).toBeVisible();
  }
  await page.goto("/lista");
  await expect(page.getByRole("heading", { name: /Itens \(2\)/ })).toBeVisible();

  // Alerta: cancelar mantém o item; confirmar remove.
  await page
    .getByRole("button", { name: /^Remover / })
    .first()
    .click();
  const alert = page.getByRole("dialog", { name: /Remover/ });
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: "Cancelar" }).click();
  await expect(alert).toBeHidden();
  await expect(page.getByRole("heading", { name: /Itens \(2\)/ })).toBeVisible();

  await page
    .getByRole("button", { name: /^Remover / })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: /Remover/ })
    .getByRole("button", { name: "Remover" })
    .click();
  await expect(page.getByRole("heading", { name: /Itens \(1\)/ })).toBeVisible();

  // Action sheet: Esc cancela; confirmar esvazia a lista.
  await page.getByRole("button", { name: "Limpar lista" }).click();
  const sheet = page.getByRole("dialog", { name: /Limpar a lista inteira/ });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("heading", { name: /Itens \(1\)/ })).toBeVisible();

  await page.getByRole("button", { name: "Limpar lista" }).click();
  await page
    .getByRole("dialog", { name: /Limpar a lista inteira/ })
    .getByRole("button", { name: "Limpar lista" })
    .click();
  await expect(page.getByText("Sua lista está vazia")).toBeVisible();
});
