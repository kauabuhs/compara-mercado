import { expect, type Page, test } from "@playwright/test";

// Seletor de cidade (CityPicker) e a busca `/api/cidades`: atalhos, busca por nome (sem acento),
// filtro por estado, estado vazio, "Em breve", cookie `compara-cidade` e efeito em /mercados e
// /comunidade. Só leitura (a cidade escolhida fica em cookie do navegador do teste).

test.describe("cidade", () => {
  const picker = (page: Page) =>
    page.getByRole("button", { name: /Cidade: .*Trocar cidade|Escolher cidade/ }).first();
  const sheet = (page: Page) => page.getByRole("dialog", { name: "Sua cidade" });

  async function openPicker(page: Page, path = "/mercados") {
    await page.goto(path);
    await picker(page).click();
    await expect(sheet(page)).toBeVisible();
  }

  test("/api/cidades: busca válida responde; parâmetros inválidos dão 400, nunca 500", async ({
    request,
  }) => {
    const ok = await request.get("/api/cidades?q=caxias");
    expect(ok.status()).toBe(200);
    const body = (await ok.json()) as { cities: Array<{ name: string; uf: string }> };
    expect(body.cities.some((city) => city.name.includes("Caxias"))).toBe(true);

    for (const bad of ["?uf=RSX", "?uf=1", "?limit=0", "?limit=9999", "?limit=abc"]) {
      const response = await request.get(`/api/cidades${bad}`);
      expect(response.status(), bad).toBe(400);
    }
    // consulta enorme ou com caracteres estranhos não derruba
    for (const odd of [`?q=${"a".repeat(500)}`, "?q=%25%25", "?q=<script>"]) {
      const response = await request.get(`/api/cidades${odd}`);
      expect(response.status(), odd).toBeLessThan(500);
    }
  });

  // QA-013: um byte nulo na busca chega ao Postgres, que o recusa; a API responde 502 e registra
  // erro (nível error) em vez de devolver 400 ou ignorar o caractere. Vale também para
  // /v1/products/search e /v1/offers. `test.fail` mantém a suíte verde até a correção.
  test("QA-013: byte nulo na busca de cidades não vira erro de servidor", async ({ request }) => {
    test.fail(true, "QA-013: %00 na busca vira 502/503");
    const response = await request.get("/api/cidades?q=%00");
    expect(response.status()).toBeLessThan(500);
  });

  test("abre com atalhos das cidades que têm mercado e fecha com Esc", async ({ page }) => {
    await openPicker(page);
    await expect(sheet(page).getByText("Cidades com mercados")).toBeVisible();
    await expect(sheet(page).getByRole("button", { name: /Caxias do Sul/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeHidden();
  });

  test("busca ignora acento e maiúscula; sem resultado explica; estado filtra", async ({
    page,
  }) => {
    await openPicker(page);
    const search = sheet(page).getByRole("searchbox", { name: "Buscar cidade" });

    await search.fill("CAXIAS");
    await expect(sheet(page).getByRole("button", { name: /Caxias do Sul · RS/ })).toBeVisible();

    await search.fill("sao paulo");
    await expect(
      sheet(page)
        .getByRole("button", { name: /São Paulo · SP/ })
        .first(),
    ).toBeVisible();

    await search.fill("zzzqqqxxw");
    await expect(
      sheet(page).getByText("Nenhuma cidade encontrada. Confira a grafia ou escolha o estado."),
    ).toBeVisible();

    // só o estado (sem nome): lista as cidades dele
    await search.fill("");
    await sheet(page).getByLabel("Filtrar por estado").selectOption("RS");
    await expect(sheet(page).getByText("Cidades de Rio Grande do Sul")).toBeVisible();
    await expect(sheet(page).getByRole("button", { name: /· RS/ }).first()).toBeVisible();
    await expect(sheet(page).getByRole("button", { name: /· SP/ })).toHaveCount(0);
  });

  test("escolher a cidade piloto: fecha, atualiza o botão e vale ao recarregar (cookie)", async ({
    page,
    context,
  }) => {
    await openPicker(page);
    await sheet(page)
      .getByRole("button", { name: /Caxias do Sul/ })
      .first()
      .click();
    await expect(sheet(page)).toBeHidden();
    await expect(page.getByRole("button", { name: /Cidade: Caxias do Sul/ }).first()).toBeVisible();

    const cookies = await context.cookies();
    expect(cookies.some((cookie) => cookie.name === "compara-cidade")).toBe(true);

    await page.reload();
    await expect(page.getByRole("button", { name: /Cidade: Caxias do Sul/ }).first()).toBeVisible();
    await page.goto("/comunidade");
    await expect(page.getByRole("button", { name: /Cidade: Caxias do Sul/ }).first()).toBeVisible();
  });

  test("cidade sem mercado: aparece 'Em breve' e as telas avisam em vez de mostrar vazio", async ({
    page,
  }) => {
    await openPicker(page);
    const search = sheet(page).getByRole("searchbox", { name: "Buscar cidade" });
    await search.fill("Porto Alegre");
    const row = sheet(page)
      .getByRole("button", { name: /Porto Alegre · RS/ })
      .first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("Em breve");
    await row.click();
    await expect(sheet(page)).toBeHidden();

    await expect(page.getByText("Ainda não temos mercados em Porto Alegre")).toBeVisible();
    await page.goto("/comunidade");
    await expect(page.getByText("Ainda não temos mercados em Porto Alegre")).toBeVisible();

    // dá para voltar: o seletor continua à mão no aviso
    await picker(page).click();
    await sheet(page)
      .getByRole("button", { name: /Caxias do Sul/ })
      .first()
      .click();
    await expect(sheet(page)).toBeHidden();
    await expect(page.getByText("Ainda não temos mercados em Porto Alegre")).toHaveCount(0);
  });

  test("cidade inventada (id inexistente) pela ação do servidor não derruba a tela", async ({
    page,
  }) => {
    // Cookie com id que não existe: a tela volta ao estado sem cidade, sem erro.
    await page.context().addCookies([
      {
        name: "compara-cidade",
        value: "00000000-0000-4000-8000-000000000000",
        domain: "localhost",
        path: "/",
      },
    ]);
    await page.goto("/mercados");
    await expect(page.getByRole("heading", { name: "Algo deu errado" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Mercados e mapa", level: 1 })).toBeVisible();

    await page
      .context()
      .addCookies([{ name: "compara-cidade", value: "lixo", domain: "localhost", path: "/" }]);
    await page.goto("/mercados");
    await expect(page.getByRole("heading", { name: "Algo deu errado" })).toHaveCount(0);
  });
});
