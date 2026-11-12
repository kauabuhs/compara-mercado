import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";
import { hasLocalSupabase, sessionCookies, signInAsAdmin, signUpNewUser } from "./support/session";

// Contribuição de preço ponta a ponta, num navegador de verdade:
//   usuário comum (cookie) -> /contribuir -> Next (Server Action) -> API (sanitiza a foto, guarda no
//   bucket privado, cria o envio PENDENTE) -> /conta/envios -> admin revisa vendo a foto -> decisão.
// Escreve no Supabase LOCAL (usuário descartável + um envio por teste). Observações são imutáveis,
// então os registros ficam no banco local; `pnpm db:reset` limpa. Nunca roda fora de localhost.
//
// O teste que APROVA publica um preço de verdade no banco local, por isso só roda com
// E2E_ALLOW_PUBLISH=1.

const ALLOW_PUBLISH = process.env["E2E_ALLOW_PUBLISH"] === "1";

/** Foto de verdade, gerada no navegador: blocos de cor aleatórios (a cada execução é uma foto nova). */
async function makePhoto(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const small = document.createElement("canvas");
    small.width = 100;
    small.height = 80;
    const smallContext = small.getContext("2d");
    if (!smallContext) throw new Error("sem canvas");
    for (let x = 0; x < small.width; x++) {
      for (let y = 0; y < small.height; y++) {
        smallContext.fillStyle = `rgb(${Math.floor(Math.random() * 256)},${Math.floor(Math.random() * 256)},${Math.floor(Math.random() * 256)})`;
        smallContext.fillRect(x, y, 1, 1);
      }
    }
    const big = document.createElement("canvas");
    big.width = 1200;
    big.height = 960;
    const bigContext = big.getContext("2d");
    if (!bigContext) throw new Error("sem canvas");
    bigContext.imageSmoothingEnabled = false;
    bigContext.drawImage(small, 0, 0, big.width, big.height);
    return big.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "";
  });
  return Buffer.from(base64, "base64");
}

/** Preço único por execução (e por projeto): é assim que o admin acha o envio na fila. */
function uniquePrice(projectName: string) {
  const reais = projectName === "mobile" ? 3 : 4;
  const cents = 10 + Math.floor(Math.random() * 90);
  // `(?!\d)` e não `\b`: no cartão o preço vem colado ao texto seguinte ("R$ 4,24Aprovar").
  return { typed: `${reais},${cents}`, pattern: new RegExp(`R\\$\\s*${reais},${cents}(?!\\d)`) };
}

/** Preenche e envia o formulário como o usuário faria. Devolve o produto escolhido. */
async function submitPrice(page: Page, price: string): Promise<string> {
  await page.goto("/contribuir");
  await expect(page.getByRole("heading", { name: "Contribuir", level: 1 })).toBeVisible();

  await page.getByLabel("Em qual mercado você está?").selectOption({ index: 1 });
  await page.getByPlaceholder("Ex.: arroz, leite, café").fill("arroz");
  const firstResult = page
    .getByRole("list", { name: "Produtos encontrados" })
    .getByRole("button")
    .first();
  await expect(firstResult).toBeVisible();
  const productName = ((await firstResult.locator("span").first().textContent()) ?? "").trim();
  await firstResult.click();
  await expect(page.getByRole("button", { name: "Trocar" })).toBeVisible();

  await page.getByLabel("Preço da etiqueta (R$)").fill(price);

  const submit = page.getByRole("button", { name: "Enviar para análise" });
  await expect(submit).toBeDisabled(); // sem foto não envia
  await page.locator('input[type="file"]').setInputFiles({
    name: "etiqueta.jpg",
    mimeType: "image/jpeg",
    buffer: await makePhoto(page),
  });
  await expect(page.getByAltText("Foto da etiqueta que será enviada")).toBeVisible();
  await expect(submit).toBeEnabled();

  await page.getByText("A foto mostra só a etiqueta").click(); // consentimento
  await submit.click();
  await expect(page.getByRole("heading", { name: "Obrigado!" })).toBeVisible();
  return productName;
}

/** Percorre a fila do admin até achar o cartão do envio (a fila é paginada, do mais antigo). */
async function findReviewCard(adminPage: Page, pricePattern: RegExp): Promise<Locator> {
  for (let pageNumber = 1; pageNumber <= 40; pageNumber++) {
    await adminPage.goto(
      pageNumber === 1 ? "/admin/revisao" : `/admin/revisao?pagina=${pageNumber}`,
    );
    await expect(adminPage.getByRole("heading", { name: "Fila de revisão" })).toBeVisible();
    const card = adminPage
      .locator("li")
      .filter({ hasText: pricePattern })
      .filter({ has: adminPage.locator('img[alt^="Foto da etiqueta"]') });
    if ((await card.count()) > 0) return card.first();
    const nextLink = adminPage.getByRole("link", { name: /próxima/i });
    if ((await nextLink.count()) === 0) break;
  }
  throw new Error(`envio com ${pricePattern} não apareceu na fila de revisão`);
}

async function expectPhotoLoaded(card: Locator) {
  const image = card.locator("img").first();
  await image.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth),
    )
    .toBeGreaterThan(0);
}

test.describe("contribuição de preço com foto", () => {
  test.skip(!hasLocalSupabase, "exige o Supabase local");

  let userSession: unknown;
  let adminContext: BrowserContext;

  test.beforeAll(async () => {
    userSession = await signUpNewUser("contrib");
  });

  test.beforeEach(async ({ context, baseURL, browser }) => {
    const origin = baseURL ?? "http://localhost:3100";
    await context.addCookies(sessionCookies(userSession, origin));
    adminContext = await browser.newContext({ baseURL: origin });
    await adminContext.addCookies(sessionCookies(await signInAsAdmin(), origin));
  });

  test.afterEach(async () => {
    await adminContext.close();
  });

  test("visitante é convidado a entrar, sem ver o formulário", async ({ browser, baseURL }) => {
    const visitor = await browser.newContext({ baseURL: baseURL ?? "http://localhost:3100" });
    const page = await visitor.newPage();
    await page.goto("/contribuir");
    await expect(page.getByRole("heading", { name: "Entre para enviar preços" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar para análise" })).toHaveCount(0);
    await page.goto("/conta/envios");
    await expect(page).toHaveURL(/\/conta$/); // sem sessão, volta para o login
    await visitor.close();
  });

  test("usuário comum não entra no painel nem alcança a foto de um envio", async ({
    page,
    request,
  }, testInfo) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/conta$/); // guarda do layout do admin

    // envia um preço e pega o id da foto pelo painel do admin
    const price = uniquePrice(testInfo.project.name);
    await submitPrice(page, price.typed);
    const adminPage = await adminContext.newPage();
    const card = await findReviewCard(adminPage, price.pattern);
    const photoSrc = await card.locator("img").first().getAttribute("src");
    expect(photoSrc).toMatch(/^\/admin\/foto\/[0-9a-f-]{36}$/);

    // o autor (usuário comum) NÃO consegue baixar a própria foto pelo caminho do admin
    const asUser = await page.request.get(photoSrc ?? "");
    expect(asUser.status()).toBe(403);
    // e sem login também não (a fixture `request` não carrega cookie nenhum)
    const anonymous = await request.get(photoSrc ?? "");
    expect(anonymous.status()).toBe(401);

    // limpa: rejeita para não deixar pendência na fila
    await card.getByRole("button", { name: "Rejeitar" }).click();
    await adminPage.getByRole("button", { name: "Rejeitar" }).last().click();
    await expect(adminPage.locator("li").filter({ hasText: price.pattern })).toHaveCount(0);
  });

  test("envia, acompanha, o admin vê a foto e rejeita", async ({ page }, testInfo) => {
    const price = uniquePrice(testInfo.project.name);
    const productName = await submitPrice(page, price.typed);

    // o autor vê o envio "em análise"
    await page.goto("/conta/envios");
    const mine = page.locator("li").filter({ hasText: price.pattern });
    await expect(mine).toContainText(productName);
    await expect(mine).toContainText("Em análise");

    // e o preço NÃO está público enquanto pendente
    await page.goto(`/busca?q=arroz`);
    await expect(page.getByText(price.pattern)).toHaveCount(0);

    // o admin vê o cartão com a foto carregando e rejeita
    const adminPage = await adminContext.newPage();
    const card = await findReviewCard(adminPage, price.pattern);
    await expect(card).toContainText(productName);
    await expect(card).toContainText("foto de usuário");
    await expectPhotoLoaded(card);
    await card.getByRole("button", { name: "Rejeitar" }).click();
    await adminPage.getByRole("button", { name: "Rejeitar" }).last().click();
    await expect(adminPage.locator("li").filter({ hasText: price.pattern })).toHaveCount(0);

    // o autor vê o resultado
    await page.goto("/conta/envios");
    await expect(page.locator("li").filter({ hasText: price.pattern })).toContainText(
      "Não aprovado",
    );
  });

  test("arquivo que não é imagem é recusado no aparelho, sem chegar ao servidor", async ({
    page,
  }) => {
    await page.goto("/contribuir");
    await page.getByLabel("Em qual mercado você está?").selectOption({ index: 1 });
    await page.getByPlaceholder("Ex.: arroz, leite, café").fill("arroz");
    await page
      .getByRole("list", { name: "Produtos encontrados" })
      .getByRole("button")
      .first()
      .click();
    await page.getByLabel("Preço da etiqueta (R$)").fill("5,55");
    await page.getByText("A foto mostra só a etiqueta").click();

    // arquivo que não é imagem: o navegador nem consegue preparar a foto
    await page.locator('input[type="file"]').setInputFiles({
      name: "documento.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("isto não é uma imagem"),
    });
    await expect(page.getByRole("alert").filter({ hasText: /abrir essa foto/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar para análise" })).toBeDisabled();
  });

  test.describe("publicação", () => {
    test.skip(!ALLOW_PUBLISH, "publica preço no banco local: rode com E2E_ALLOW_PUBLISH=1");

    test("ao aprovar, o preço aparece na página pública do produto", async ({
      page,
      browser,
      baseURL,
      request,
    }, testInfo) => {
      const price = uniquePrice(testInfo.project.name);
      const productName = await submitPrice(page, price.typed);

      // Linha de base pela API, com cache-bust (não esquenta o cache da página): com o envio ainda
      // PENDENTE o preço não é público. Sem isto, um preço do seed igual ao sorteado faria o teste
      // passar sem provar que foi a aprovação que publicou.
      const apiBase = `http://127.0.0.1:${process.env["E2E_API_PORT"] ?? 4100}`;
      const bust = () => `nocache=${Date.now()}${Math.random()}`;
      const search = (await (
        await request.get(`${apiBase}/v1/products/search?q=arroz&pageSize=8&${bust()}`)
      ).json()) as { hits: { productId: string; name: string }[] };
      const productId = search.hits.find((hit) => hit.name === productName)?.productId;
      expect(productId).toBeTruthy();
      const publicPrices = async () =>
        (
          (await (await request.get(`${apiBase}/v1/products/${productId}?${bust()}`)).json()) as {
            prices: { priceCents: number }[];
          }
        ).prices.map((offer) => offer.priceCents);
      const priceCents = Math.round(Number(price.typed.replace(",", ".")) * 100);
      expect(await publicPrices()).not.toContain(priceCents);

      const adminPage = await adminContext.newPage();
      const card = await findReviewCard(adminPage, price.pattern);
      await card.getByRole("button", { name: "Aprovar" }).click();
      await expect(adminPage.locator("li").filter({ hasText: price.pattern })).toHaveCount(0);
      expect(await publicPrices()).toContain(priceCents); // a API já serve o preço aprovado

      // Visitante (sem login) na página do produto. Há dois caches públicos empilhados (API 60 s +
      // Next 60 s; a aprovação só invalida o do Next), então no pior caso leva ~2 min: o normal é
      // aparecer logo, e a espera longa é só a rede de segurança.
      const visitorContext = await browser.newContext({
        baseURL: baseURL ?? "http://localhost:3100",
      });
      const visitor = await visitorContext.newPage();
      await visitor.goto(`/busca?q=${encodeURIComponent("arroz")}`);
      await visitor
        .getByRole("link", { name: new RegExp(productName) })
        .first()
        .click();
      await expect(async () => {
        await visitor.reload();
        await expect(visitor.getByText(price.pattern).first()).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 150_000, intervals: [3_000] });
      await visitorContext.close();

      await page.goto("/conta/envios");
      await expect(page.locator("li").filter({ hasText: price.pattern })).toContainText(
        "Publicado",
      );
    });
  });
});
