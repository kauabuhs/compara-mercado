import { expect, type Page, test } from "@playwright/test";
import { hasLocalSupabase, sessionCookies, signUpNewUser } from "./support/session";

// Validações do formulário de contribuir (/contribuir): campos obrigatórios, preço, foto pequena,
// foto repetida, perda de dados e consentimento. Os casos que publicam de verdade só rodam com
// E2E_ALLOW_PUBLISH=1. Cada teste usa uma pessoa descartável. Só roda contra o Supabase LOCAL.

const ALLOW_PUBLISH = process.env["E2E_ALLOW_PUBLISH"] === "1";

test.describe("contribuir: validações", () => {
  test.skip(!hasLocalSupabase, "exige o Supabase local");

  let session: unknown;
  test.beforeAll(async () => {
    session = await signUpNewUser("contrib-val");
  });

  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies(sessionCookies(session, baseURL ?? "http://localhost:3100"));
  });

  /** JPEG feito no navegador: mesma largura, altura e `seed` geram sempre os mesmos bytes. */
  async function makePhoto(page: Page, width: number, height: number, seed: number) {
    const base64 = await page.evaluate(
      ({ width, height, seed }) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("sem canvas");
        let state = seed;
        const next = () => {
          state = (state * 1664525 + 1013904223) % 4294967296;
          return state / 4294967296;
        };
        for (let x = 0; x < width; x += 8) {
          for (let y = 0; y < height; y += 8) {
            context.fillStyle = `rgb(${Math.floor(next() * 256)},${Math.floor(next() * 256)},${Math.floor(next() * 256)})`;
            context.fillRect(x, y, 8, 8);
          }
        }
        return canvas.toDataURL("image/jpeg", 0.9).split(",")[1] ?? "";
      },
      { width, height, seed },
    );
    return Buffer.from(base64, "base64");
  }

  async function chooseStoreAndProduct(page: Page) {
    await page.goto("/contribuir");
    await expect(page.getByRole("heading", { name: "Contribuir", level: 1 })).toBeVisible();
    await page.getByLabel("Em qual mercado você está?").selectOption({ index: 1 });
    await page.getByPlaceholder("Ex.: arroz, leite, café").fill("arroz");
    await page
      .getByRole("list", { name: "Produtos encontrados" })
      .getByRole("button")
      .first()
      .click();
    await expect(page.getByRole("button", { name: "Trocar" })).toBeVisible();
  }

  async function attachPhoto(page: Page, buffer: Buffer) {
    await page.locator('input[type="file"]').setInputFiles({
      name: "etiqueta.jpg",
      mimeType: "image/jpeg",
      buffer,
    });
  }

  /** Só os avisos do formulário (o Next também tem um `role=alert` invisível para anunciar rotas). */
  const formAlert = (page: Page) => page.locator("form [role=alert]");

  const submit = (page: Page) => page.getByRole("button", { name: "Enviar para análise" });

  test("sem produto e sem foto o botão fica desligado e diz o que falta", async ({ page }) => {
    await page.goto("/contribuir");
    await expect(submit(page)).toBeDisabled();
    await expect(page.getByText("Escolha o produto e tire a foto para enviar.")).toBeVisible();

    await chooseStoreAndProduct(page);
    await expect(submit(page)).toBeDisabled();
    await expect(page.getByText("Tire a foto da etiqueta para enviar.")).toBeVisible();

    await attachPhoto(page, await makePhoto(page, 800, 640, 1));
    await expect(page.getByAltText("Foto da etiqueta que será enviada")).toBeVisible();
    await expect(submit(page)).toBeEnabled();
  });

  test("busca de produto: sem resultado avisa; trocar volta à busca", async ({ page }) => {
    await page.goto("/contribuir");
    await page.getByPlaceholder("Ex.: arroz, leite, café").fill("zzzzqqqxxw");
    await expect(page.getByText("Não achamos esse produto.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Produtos encontrados" })).toHaveCount(0);

    await chooseStoreAndProduct(page);
    await page.getByRole("button", { name: "Trocar" }).click();
    await expect(page.getByPlaceholder("Ex.: arroz, leite, café")).toBeVisible();
  });

  test("foto pequena demais é recusada no aparelho e a boa a substitui", async ({ page }) => {
    await chooseStoreAndProduct(page);
    await attachPhoto(page, await makePhoto(page, 200, 200, 2));
    await expect(formAlert(page).filter({ hasText: "pequena demais" })).toBeVisible();
    await expect(submit(page)).toBeDisabled();

    await attachPhoto(page, await makePhoto(page, 800, 640, 3));
    await expect(page.getByAltText("Foto da etiqueta que será enviada")).toBeVisible();
    await expect(formAlert(page).filter({ hasText: "pequena demais" })).toHaveCount(0);
    await expect(submit(page)).toBeEnabled();
  });

  test("preço: formato inválido o navegador barra; zero e acima do teto voltam com aviso e sem perder o digitado", async ({
    page,
  }) => {
    await chooseStoreAndProduct(page);
    await attachPhoto(page, await makePhoto(page, 800, 640, 4));
    await page.getByText("A foto mostra só a etiqueta").click();
    const price = page.getByLabel("Preço da etiqueta (R$)");

    // Validação nativa (padrão do campo): nada é enviado, então nenhum aviso aparece.
    for (const invalid of ["abc", "5,999", "1234567", "5,"]) {
      await price.fill(invalid);
      await submit(page).click();
      await expect(formAlert(page), invalid).toHaveCount(0);
    }

    // Zero passa pelo padrão do campo e é barrado pelo servidor do Next.
    await price.fill("0");
    await submit(page).click();
    await expect(formAlert(page)).toHaveText("Informe o preço da etiqueta, por exemplo 5,99.");

    // R$ 10.000,01 passa pelo campo, mas a API recusa (teto R$ 10.000,00): mensagem genérica
    // (QA-010) e o que a pessoa digitou continua no formulário.
    await price.fill("10000,01");
    await submit(page).click();
    await expect(formAlert(page)).toHaveText(
      "Não foi possível enviar agora. Tente de novo em instantes.",
    );
    await expect(price).toHaveValue("10000,01");
    await expect(page.getByRole("button", { name: "Trocar" })).toBeVisible(); // produto mantido
    await expect(page.getByAltText("Foto da etiqueta que será enviada")).toBeVisible();
  });

  test("sem o consentimento marcado o formulário nem é enviado", async ({ page }) => {
    await chooseStoreAndProduct(page);
    await attachPhoto(page, await makePhoto(page, 800, 640, 5));
    await page.getByLabel("Preço da etiqueta (R$)").fill("5,55");
    await submit(page).click();
    await expect(page.getByRole("heading", { name: "Obrigado!" })).toHaveCount(0);
    await expect(formAlert(page)).toHaveCount(0);
  });

  test.describe("publicação", () => {
    test.skip(!ALLOW_PUBLISH, "publica preço no banco local: rode com E2E_ALLOW_PUBLISH=1");

    test("a mesma foto enviada duas vezes: a segunda é recusada com aviso claro", async ({
      page,
    }, info) => {
      const seed = 100_000 + Math.floor(Math.random() * 900_000);
      const cents = 10 + Math.floor(Math.random() * 80);
      const typed = `${info.project.name === "mobile" ? 2 : 3},${cents}`;
      const photo = await (async () => {
        await page.goto("/contribuir");
        return makePhoto(page, 800, 640, seed);
      })();

      await chooseStoreAndProduct(page);
      await attachPhoto(page, photo);
      await page.getByLabel("Preço da etiqueta (R$)").fill(typed);
      await page.getByText("A foto mostra só a etiqueta").click();
      await submit(page).click();
      await expect(page.getByRole("heading", { name: "Obrigado!" })).toBeVisible();

      await page.getByRole("button", { name: "Enviar outro preço" }).click();
      await chooseStoreAndProduct(page);
      await attachPhoto(page, photo);
      await page.getByLabel("Preço da etiqueta (R$)").fill(typed);
      await page.getByText("A foto mostra só a etiqueta").click();
      await submit(page).click();
      await expect(formAlert(page)).toHaveText("Essa foto já foi enviada.");
      // o formulário continua preenchido
      await expect(page.getByLabel("Preço da etiqueta (R$)")).toHaveValue(typed);
    });
  });
});
