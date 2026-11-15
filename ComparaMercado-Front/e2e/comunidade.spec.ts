import { expect, type Locator, type Page, test } from "@playwright/test";
import { submitPrice, uniquePrice } from "./support/contribution";
import { hasLocalSupabase, sessionCookies, signInAsAdmin, signUpNewUser } from "./support/session";

// Comunidade ponta a ponta (ADR-0010), num navegador de verdade:
//   pessoa A publica um preço com foto -> aparece no feed como "aguardando confirmação" ->
//   pessoa B (outra conta) confirma, vê a foto e denuncia -> visitante só é convidado a entrar.
// Escreve no Supabase LOCAL (usuários descartáveis + um envio por teste). Observações são
// imutáveis; o envio é REJEITADO no fim (pelo admin) para sair do feed. Nunca roda fora de localhost.

/** O cartão da publicação no feed: acha pelo preço único do teste (a lista é do mais novo ao mais antigo). */
function feedCard(page: Page, pricePattern: RegExp): Locator {
  return page.locator("div.animate-fade-in").filter({ hasText: pricePattern }).first();
}

async function openFeed(page: Page, pricePattern: RegExp): Promise<Locator> {
  await page.goto("/comunidade");
  await expect(page.getByRole("heading", { name: "Comunidade", level: 1 })).toBeVisible();
  const card = feedCard(page, pricePattern);
  await expect(card).toBeVisible();
  return card;
}

test.describe("comunidade de preços", () => {
  test.skip(!hasLocalSupabase, "exige o Supabase local");

  let sessionA: unknown;
  let sessionB: unknown;

  test.beforeAll(async () => {
    [sessionA, sessionB] = await Promise.all([signUpNewUser("com-a"), signUpNewUser("com-b")]);
  });

  test("a navegação principal destaca Comunidade e o feed abre sem login", async ({
    browser,
    baseURL,
  }) => {
    const visitor = await browser.newContext({ baseURL: baseURL ?? "http://localhost:3100" });
    const page = await visitor.newPage();
    await page.goto("/comunidade");
    await expect(page.getByRole("heading", { name: "Comunidade", level: 1 })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Comunidade" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("radiogroup", { name: "Filtro do feed" })).toBeVisible();
    await visitor.close();
  });

  test("publica, outra pessoa confirma e vê a foto, visitante só é convidado a entrar", async ({
    browser,
    baseURL,
  }, testInfo) => {
    const origin = baseURL ?? "http://localhost:3100";
    const price = uniquePrice(testInfo.project.name);

    // Pessoa A publica pela interface (a mesma de /contribuir).
    const authorContext = await browser.newContext({ baseURL: origin });
    await authorContext.addCookies(sessionCookies(sessionA, origin));
    const authorPage = await authorContext.newPage();
    // A escolhe um apelido público: é ele (e não o nome) que as outras pessoas veem.
    const nickname = `Ana QA ${Date.now() % 100000}`;
    await authorPage.goto("/conta/perfil");
    await authorPage.getByLabel("Apelido na Comunidade (opcional)").fill(nickname);
    await authorPage.getByLabel("Como quer ser chamado?").fill("Ana Nome Real");
    await authorPage.getByRole("button", { name: "Salvar" }).click();
    await expect(authorPage.getByText("Dados salvos.")).toBeVisible();
    const productName = await submitPrice(authorPage, price.typed);

    // A vê a própria publicação: aguardando confirmação, sem botões de votar.
    const own = await openFeed(authorPage, price.pattern);
    await expect(own).toContainText(productName);
    await expect(own).toContainText("Aguardando confirmação");
    await expect(own).toContainText("Esta é a sua publicação");
    await expect(own.getByRole("button", { name: "Ainda está assim" })).toHaveCount(0);

    // Visitante: vê o preço, mas é convidado a entrar (sem votar, sem foto).
    const visitorContext = await browser.newContext({ baseURL: origin });
    const visitorPage = await visitorContext.newPage();
    // O feed de visitante fica em cache por até 15 s na API (por design): recarrega até aparecer.
    const asVisitor = feedCard(visitorPage, price.pattern);
    await expect(async () => {
      await visitorPage.goto("/comunidade");
      await expect(asVisitor).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 30_000, intervals: [2_000] });
    await expect(asVisitor).toContainText("Aguardando confirmação");
    await expect(
      asVisitor.getByRole("link", { name: "Entre para confirmar este preço" }),
    ).toBeVisible();
    await expect(asVisitor.getByRole("button", { name: "Ver foto" })).toHaveCount(0);
    await visitorContext.close();

    // Pessoa B confirma, e o voto persiste ao recarregar.
    const otherContext = await browser.newContext({ baseURL: origin });
    await otherContext.addCookies(sessionCookies(sessionB, origin));
    const otherPage = await otherContext.newPage();
    const asOther = await openFeed(otherPage, price.pattern);
    await asOther.getByRole("button", { name: "Ainda está assim" }).click();
    await expect(asOther).toContainText(nickname);
    await expect(asOther).not.toContainText("Ana Nome Real"); // o nome real nunca aparece
    await expect(asOther.getByRole("button", { name: "Você confirmou" })).toBeDisabled();
    await expect(asOther).toContainText("1 confirmação");
    const reloaded = await openFeed(otherPage, price.pattern);
    await expect(reloaded.getByRole("button", { name: "Você confirmou" })).toBeDisabled();

    // B vê a foto da etiqueta (route handler do Next, com a sessão de B).
    await reloaded.getByRole("button", { name: "Ver foto" }).click();
    const photo = otherPage.getByAltText(/^Etiqueta de /);
    await expect(photo).toBeVisible();
    await expect
      .poll(() => photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth))
      .toBeGreaterThan(0);
    await otherPage.keyboard.press("Escape");

    // B denuncia: agradece e não permite denunciar de novo.
    await reloaded.getByRole("button", { name: "Denunciar publicação" }).click();
    await otherPage.getByRole("button", { name: "O preço está errado" }).click();
    await expect(reloaded).toContainText("Obrigado. Vamos analisar a denúncia.");
    await expect(reloaded.getByRole("button", { name: "Denunciar publicação" })).toBeDisabled();

    // B ganhou 1 ponto por confirmar: aparece na tela de reputação (nível inicial).
    await otherPage.goto("/conta/reputacao");
    await expect(
      otherPage.getByRole("heading", { name: "Minha reputação", level: 1 }),
    ).toBeVisible();
    await expect(otherPage.getByText("Novato")).toBeVisible();
    await expect(otherPage.getByText("Você confirmou o preço de alguém")).toBeVisible();

    // Limpeza: o admin rejeita o envio para ele sair do feed.
    const admin = await browser.newContext({ baseURL: origin });
    await admin.addCookies(sessionCookies(await signInAsAdmin(), origin));
    const adminPage = await admin.newPage();
    for (let pageNumber = 1; pageNumber <= 40; pageNumber++) {
      await adminPage.goto(
        pageNumber === 1 ? "/admin/revisao" : `/admin/revisao?pagina=${pageNumber}`,
      );
      const card = adminPage.locator("li").filter({ hasText: price.pattern });
      if ((await card.count()) > 0) {
        await card.first().getByRole("button", { name: "Rejeitar" }).click();
        await adminPage.getByRole("button", { name: "Rejeitar" }).last().click();
        await expect(adminPage.locator("li").filter({ hasText: price.pattern })).toHaveCount(0);
        break;
      }
      if ((await adminPage.getByRole("link", { name: /próxima/i }).count()) === 0) break;
    }
    await admin.close();
    await otherContext.close();
    await authorContext.close();
  });
});
