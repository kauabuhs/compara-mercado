import { expect, type Locator, type Page, test } from "@playwright/test";
import { adminAccessToken, apiRequest } from "./support/api";
import { submitPrice, uniquePrice } from "./support/contribution";
import { hasLocalSupabase, sessionCookies, signInAsAdmin, signUpNewUser } from "./support/session";

// Moderação de preços denunciados (ADR-0016) ponta a ponta: uma pessoa publica, três outras
// denunciam (a terceira abre a tarefa), o admin decide em /admin/moderacao (aprovar, rejeitar,
// manter, retirar) e o motivo aparece em "Meus envios". Escreve no Supabase LOCAL (usuários
// descartáveis; os envios são decididos no fim do próprio teste). Nunca roda fora de localhost.

interface Session {
  access_token: string;
}

test.describe("admin: moderação", () => {
  test.skip(!hasLocalSupabase, "exige o Supabase local");

  let author: Session;
  let reporters: Session[];

  test.beforeAll(async () => {
    const sessions = await Promise.all([
      signUpNewUser("mod-autor"),
      signUpNewUser("mod-r1"),
      signUpNewUser("mod-r2"),
      signUpNewUser("mod-r3"),
    ]);
    author = sessions[0] as Session;
    reporters = sessions.slice(1) as Session[];
  });

  /** A pessoa publica pela interface; devolve o id da observação (pela lista dos próprios envios). */
  async function publishAs(
    page: Page,
    baseURL: string,
    price: ReturnType<typeof uniquePrice>,
  ): Promise<{ observationId: string; productName: string }> {
    await page.context().addCookies(sessionCookies(author, baseURL));
    const productName = await submitPrice(page, price.typed);
    const cents = Math.round(Number(price.typed.replace(",", ".")) * 100);
    const mine = await apiRequest<{ contributions: Array<{ id: string; priceCents: number }> }>(
      author.access_token,
      "GET",
      "/v1/me/contributions?page=1&pageSize=50",
    );
    const found = mine.body.contributions.find((contribution) => contribution.priceCents === cents);
    if (!found) throw new Error("o envio não apareceu em 'Meus envios'");
    return { observationId: found.id, productName };
  }

  async function report(observationId: string, reasons: string[]) {
    for (const [index, reason] of reasons.entries()) {
      const response = await apiRequest(
        (reporters[index] as Session).access_token,
        "POST",
        `/v1/community/observations/${observationId}/reports`,
        { reason },
      );
      expect(response.status, `denúncia ${index + 1}`).toBe(201);
    }
  }

  async function approveAsAdmin(observationId: string) {
    const response = await apiRequest(
      await adminAccessToken(),
      "POST",
      `/v1/admin/observations/${observationId}/review`,
      { decision: "approved" },
    );
    expect(response.status).toBe(200);
  }

  async function openModeration(page: Page, pattern: RegExp): Promise<Locator> {
    await page.goto("/admin/moderacao");
    await expect(page.getByRole("heading", { name: "Moderação", level: 1 })).toBeVisible();
    const card = page.getByRole("listitem").filter({ hasText: pattern }).first();
    await expect(card).toBeVisible();
    return card;
  }

  async function confirm(page: Page, label: string) {
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: label, exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  /** O envio visto pela própria pessoa em /conta/envios. */
  async function myContribution(
    browser: import("@playwright/test").Browser,
    base: string,
    pattern: RegExp,
  ) {
    const context = await browser.newContext({ baseURL: base });
    await context.addCookies(sessionCookies(author, base));
    const page = await context.newPage();
    await page.goto("/conta/envios");
    const item = page.getByRole("listitem").filter({ hasText: pattern }).first();
    await expect(item).toBeVisible();
    return { item, close: () => context.close() };
  }

  test("preço pendente com 3 denúncias: a tarefa mostra os motivos e rejeitar explica a quem enviou", async ({
    page,
    browser,
    baseURL,
  }, info) => {
    const origin = baseURL ?? "http://localhost:3100";
    const price = uniquePrice(info.project.name);
    const { observationId, productName } = await publishAs(page, origin, price);
    await report(observationId, ["wrong_price", "wrong_price", "spam"]);

    await page.context().clearCookies();
    await page.context().addCookies(sessionCookies(await signInAsAdmin(), origin));
    const card = await openModeration(page, price.pattern);
    await expect(card).toContainText(productName);
    await expect(card).toContainText("aguardando");
    await expect(card).toContainText("2× preço errado");
    await expect(card).toContainText("1× spam");
    await expect(card.getByRole("button", { name: "Aprovar" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Manter" })).toHaveCount(0);

    await card.getByLabel("Motivo da rejeição").selectOption("O preço não confere com a foto");
    await card.getByRole("button", { name: "Rejeitar", exact: true }).click();
    await confirm(page, "Rejeitar");
    await expect(page.getByRole("listitem").filter({ hasText: price.pattern })).toHaveCount(0);

    const mine = await myContribution(browser, origin, price.pattern);
    await expect(mine.item).toContainText("Não aprovado");
    await expect(mine.item).toContainText("Motivo: O preço não confere com a foto");
    await mine.close();
  });

  test("preço pendente com 3 denúncias: aprovar publica e tira da fila", async ({
    page,
    browser,
    baseURL,
  }, info) => {
    const origin = baseURL ?? "http://localhost:3100";
    const price = uniquePrice(info.project.name);
    const { observationId } = await publishAs(page, origin, price);
    await report(observationId, ["other", "wrong_store", "wrong_product"]);

    await page.context().clearCookies();
    await page.context().addCookies(sessionCookies(await signInAsAdmin(), origin));
    const card = await openModeration(page, price.pattern);
    await expect(card).toContainText("1× outro motivo");
    await card.getByRole("button", { name: "Aprovar" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: price.pattern })).toHaveCount(0);

    const mine = await myContribution(browser, origin, price.pattern);
    await expect(mine.item).toContainText("Publicado");
    await mine.close();
  });

  test("preço já publicado e denunciado: 'Manter' preserva o preço", async ({
    page,
    browser,
    baseURL,
  }, info) => {
    const origin = baseURL ?? "http://localhost:3100";
    const price = uniquePrice(info.project.name);
    const { observationId } = await publishAs(page, origin, price);
    await approveAsAdmin(observationId);
    await report(observationId, ["spam", "spam", "spam"]);

    await page.context().clearCookies();
    await page.context().addCookies(sessionCookies(await signInAsAdmin(), origin));
    const card = await openModeration(page, price.pattern);
    await expect(card).toContainText("publicado");
    await expect(card).toContainText("3× spam");
    await expect(card.getByRole("button", { name: "Aprovar" })).toHaveCount(0);
    await card.getByRole("button", { name: "Manter" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: price.pattern })).toHaveCount(0);

    const mine = await myContribution(browser, origin, price.pattern);
    await expect(mine.item).toContainText("Publicado");
    await mine.close();
  });

  test("preço publicado e denunciado: 'Retirar' tira do feed na hora e explica o motivo", async ({
    page,
    browser,
    baseURL,
  }, info) => {
    const origin = baseURL ?? "http://localhost:3100";
    const price = uniquePrice(info.project.name);
    const { observationId } = await publishAs(page, origin, price);
    await approveAsAdmin(observationId);
    await report(observationId, ["wrong_price", "wrong_price", "wrong_price"]);

    await page.context().clearCookies();
    await page.context().addCookies(sessionCookies(await signInAsAdmin(), origin));
    const card = await openModeration(page, price.pattern);
    await card.getByLabel("Motivo da rejeição").selectOption("Preço fora da realidade");
    await card.getByRole("button", { name: "Retirar", exact: true }).click();
    await confirm(page, "Retirar");
    await expect(page.getByRole("listitem").filter({ hasText: price.pattern })).toHaveCount(0);

    const mine = await myContribution(browser, origin, price.pattern);
    await expect(mine.item).toContainText("Não aprovado");
    await expect(mine.item).toContainText("Motivo: Preço fora da realidade");
    await mine.close();

    // O feed anônimo fica em cache por até 15 s por instância: espera sumir.
    const visitor = await browser.newContext({ baseURL: origin });
    const visitorPage = await visitor.newPage();
    await expect(async () => {
      await visitorPage.goto("/comunidade");
      await expect(
        visitorPage.getByRole("heading", { name: "Comunidade", level: 1 }),
      ).toBeVisible();
      await expect(visitorPage.getByText(price.pattern)).toHaveCount(0);
    }).toPass({ timeout: 40_000, intervals: [2_000] });
    await visitor.close();
  });

  test("outra pessoa decide a mesma tarefa antes: a tela se recupera e o cartão some", async ({
    page,
    baseURL,
  }, info) => {
    const origin = baseURL ?? "http://localhost:3100";
    const price = uniquePrice(info.project.name);
    const { observationId } = await publishAs(page, origin, price);
    await report(observationId, ["spam", "other", "wrong_store"]);

    await page.context().clearCookies();
    await page.context().addCookies(sessionCookies(await signInAsAdmin(), origin));
    await openModeration(page, price.pattern);

    // Outro admin decide primeiro (pela API) enquanto a tela segue aberta com o cartão antigo.
    const queue = await apiRequest<{ items: Array<{ taskId: string; priceCents: number }> }>(
      await adminAccessToken(),
      "GET",
      "/v1/admin/moderation?pageSize=50",
    );
    const cents = Math.round(Number(price.typed.replace(",", ".")) * 100);
    const task = queue.body.items.find((item) => item.priceCents === cents);
    expect(task, "a tarefa deve estar na fila").toBeTruthy();
    const decided = await apiRequest(
      await adminAccessToken(),
      "POST",
      `/v1/admin/moderation/${task?.taskId}`,
      { action: "approve" },
    );
    expect(decided.status).toBe(200);

    // A segunda decisão recebe 404 da API; a tela trata como "já resolvida" e recarrega a fila.
    await page
      .getByRole("listitem")
      .filter({ hasText: price.pattern })
      .getByRole("button", { name: "Aprovar" })
      .click();
    await expect(page.getByRole("listitem").filter({ hasText: price.pattern })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Algo deu errado" })).toHaveCount(0);
  });

  test("fila de revisão: se outra pessoa já decidiu, a tela cai em 'Algo deu errado' (QA-011)", async ({
    page,
    baseURL,
  }, info) => {
    const origin = baseURL ?? "http://localhost:3100";
    const price = uniquePrice(info.project.name);
    const { observationId } = await publishAs(page, origin, price);

    await page.context().clearCookies();
    await page.context().addCookies(sessionCookies(await signInAsAdmin(), origin));
    // A fila pode ter muitas páginas de execuções anteriores: descobre em qual está o envio.
    let queuePage = 0;
    for (let pageNumber = 1; pageNumber <= 100 && queuePage === 0; pageNumber++) {
      const result = await apiRequest<{ observations: Array<{ id: string }> }>(
        await adminAccessToken(),
        "GET",
        `/v1/admin/review-queue?page=${pageNumber}`,
      );
      if (result.body.observations.length === 0) break;
      if (result.body.observations.some((observation) => observation.id === observationId)) {
        queuePage = pageNumber;
      }
    }
    expect(queuePage, "o envio deve estar na fila de revisão").toBeGreaterThan(0);
    await page.goto(`/admin/revisao?pagina=${queuePage}`);
    const card = page.getByRole("listitem").filter({ hasText: price.pattern }).first();
    await expect(card).toBeVisible();

    await approveAsAdmin(observationId); // outro admin decidiu primeiro

    // QA-011: reviewObservation lança Error genérico em qualquer falha (inclusive 404 de "já
    // decidido"), então a pessoa vê a página de erro em vez de a fila atualizada.
    await card.getByRole("button", { name: "Aprovar" }).click();
    await expect(page.getByRole("heading", { name: "Algo deu errado" })).toBeVisible();
  });
});
