import { expect, test } from "@playwright/test";

// Busca e filtros das listagens, mapa interativo e a página de conta. WebGL por software para o mapa.
test.use({
  launchOptions: {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  },
});

test.describe("ofertas: busca e filtros", () => {
  test("busca instantânea ignora acento, tolera erro de digitação e vai para a URL", async ({
    page,
  }) => {
    await page.goto("/ofertas");
    const cards = page.locator("main a[href^='/produto/']");
    const total = await cards.count();
    expect(total).toBeGreaterThan(3);

    const search = page.getByRole("searchbox", { name: "Buscar nas ofertas" });
    await search.fill("sabão");
    await expect(cards.first()).toContainText("Sabão em pó");
    const matches = await cards.count();
    expect(matches).toBeGreaterThanOrEqual(1);
    expect(matches).toBeLessThan(total);
    await expect(cards.filter({ hasText: "Sabão em pó" })).toHaveCount(matches);
    await expect(page).toHaveURL(/[?&]q=sab(%C3%A3|ã)o/);

    // sem acento e com letras trocadas de lugar: mesmo resultado
    await search.fill("sabao");
    await expect(cards).toHaveCount(matches);
    await search.fill("sbaão");
    await expect(cards).toHaveCount(matches);

    // nada encontrado: estado vazio com saída; limpar traz tudo de volta
    await search.fill("pneu");
    await expect(page.getByText("Nenhuma oferta com esses filtros")).toBeVisible();
    await page.getByRole("button", { name: "Limpar filtros" }).click();
    await expect(cards).toHaveCount(total);
    await expect(search).toHaveValue("");
  });

  test("filtro por mercado, ordenação por preço e link compartilhável", async ({ page }) => {
    await page.goto("/ofertas");
    const cards = page.locator("main a[href^='/produto/']");
    const total = await cards.count();

    const storeChips = page.getByRole("group", { name: "Filtros" }).getByRole("button");
    // [0] = "Todos os mercados", depois um chip por mercado e "Vence em breve"
    await storeChips.nth(1).click();
    const filtered = await cards.count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(total);
    await expect(page).toHaveURL(/[?&]loja=/);

    await page.getByLabel("Ordenar por").selectOption("price");
    const prices = await cards.evaluateAll((links) =>
      links.map((link) => {
        const text = link.textContent ?? "";
        const match = text.match(/R\$\s?(\d+),(\d{2})/);
        return match ? Number(match[1]) * 100 + Number(match[2]) : Number.NaN;
      }),
    );
    expect(prices).toEqual([...prices].sort((a, b) => a - b));

    // o estado volta ao abrir o link
    const url = page.url();
    await page.goto(url);
    await expect(page.getByLabel("Ordenar por")).toHaveValue("price");
    await expect(cards).toHaveCount(filtered);
  });
});

test.describe("busca com sugestões", () => {
  test("sugere produtos ao digitar e abre o escolhido pelo teclado", async ({ page }) => {
    await page.goto("/");
    const input = page.getByRole("combobox");
    await input.fill("arro");
    const listbox = page.getByRole("listbox", { name: "Sugestões de produtos" });
    await expect(listbox).toBeVisible();
    await expect(listbox.getByRole("option").first()).toContainText(/Arroz/);

    await input.press("ArrowDown");
    await input.press("Enter");
    await expect(page).toHaveURL(/\/produto\//);
  });

  test("Enter sem escolher sugestão leva à página de resultados", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("combobox").fill("leite");
    await page.getByRole("combobox").press("Enter");
    await expect(page).toHaveURL(/\/busca\?q=leite/);
  });
});

test.describe("mercados: mapa e lista sincronizados", () => {
  test("busca filtra lista e pinos; escolher um mercado abre o cartão com ações", async ({
    page,
  }) => {
    await page.goto("/mercados");
    const rows = page.locator("main ul li");
    await expect(rows.first()).toBeVisible();
    const storeCount = await rows.count();
    expect(storeCount).toBeGreaterThanOrEqual(6);
    await expect(page.locator(".maplibregl-marker")).toHaveCount(storeCount);

    await page.getByRole("searchbox", { name: "Buscar mercado" }).fill("centro");
    await expect(rows).toHaveCount(1);
    await expect(page.locator(".maplibregl-marker")).toHaveCount(1);

    await rows.first().getByRole("button").click();
    const verOfertas = page.getByRole("link", { name: "Ver ofertas" });
    await expect(verOfertas).toBeVisible();
    await expect(page.getByRole("link", { name: "Como chegar" })).toHaveAttribute(
      "href",
      /google\.com\/maps\/dir\/\?api=1&destination=-?\d/,
    );

    // "Ver ofertas" já chega filtrado pelo mercado
    await verOfertas.click();
    await expect(page).toHaveURL(/\/ofertas\?loja=/);
    const chips = page
      .getByRole("group", { name: "Filtros" })
      .getByRole("button", { pressed: true });
    await expect(chips).toContainText(/Centro/);
  });

  test("clicar no pino seleciona o mercado na lista", async ({ page }) => {
    await page.goto("/mercados");
    await page.locator(".store-pin").first().click();
    await expect(page.locator("main ul li button[aria-pressed='true']")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Como chegar" })).toBeVisible();
  });
});

test.describe("conta", () => {
  test("visitante vê entrada simples, atalhos, aparência e privacidade", async ({ page }) => {
    await page.goto("/conta");
    await expect(page.getByRole("heading", { name: "Conta", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Entre para contribuir" })).toBeVisible();
    await expect(page.getByLabel("Seu e-mail")).toBeVisible();
    await expect(page.getByRole("link", { name: /Minha lista de compras/ })).toBeVisible();
    await expect(page.getByText("Sua localização")).toBeVisible();
    // visitante não vê ações de conta
    await expect(page.getByRole("button", { name: "Sair da conta" })).toHaveCount(0);
    await expect(page.getByText("Excluir minha conta")).toHaveCount(0);
  });

  test("aparência: escolher escuro aplica e persiste", async ({ page }) => {
    await page.goto("/conta");
    const theme = page.getByRole("radiogroup", { name: "Aparência" });
    await theme.getByRole("radio", { name: "Escuro" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(theme.getByRole("radio", { name: "Escuro" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await theme.getByRole("radio", { name: "Sistema" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  });

  test("a lista salva aparece na conta e pode ser limpa com confirmação", async ({ page }) => {
    await page.goto("/busca?q=arroz");
    await page
      .getByRole("list", { name: /Resultados/ })
      .getByRole("link")
      .first()
      .click();
    await page.getByRole("button", { name: /Adicionar .* à lista/ }).click();
    await expect(page.getByText("Adicionado")).toBeVisible();

    await page.goto("/conta");
    await expect(page.getByRole("link", { name: /Minha lista de compras/ })).toContainText(
      "1 item",
    );
    await page.getByRole("button", { name: "Limpar lista salva" }).click();
    const sheet = page.getByRole("dialog", { name: /Limpar a lista inteira/ });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Limpar lista" }).click();
    await expect(page.getByRole("link", { name: /Minha lista de compras/ })).toContainText("vazia");
  });
});
