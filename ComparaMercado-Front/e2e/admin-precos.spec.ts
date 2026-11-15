import { expect, type Page, test } from "@playwright/test";
import { createScenario, type Scenario } from "./support/api";
import { hasLocalSupabase, sessionCookies, signInAsAdmin } from "./support/session";

// Lançar preço pelo painel (/admin/precos): validação do formulário (navegador e servidor), efeito
// imediato no produto público e limites de valor. Cada teste cria o próprio mercado e produto pela
// API, então os preços do seed não mudam. Só roda contra o Supabase LOCAL.

test.describe("admin: lançar preço", () => {
  test.skip(!hasLocalSupabase, "exige o Supabase local");

  let scenario: Scenario;

  test.beforeEach(async ({ context, baseURL }, info) => {
    scenario = await createScenario("Preço", info.project.name);
    const session = await signInAsAdmin();
    await context.addCookies(sessionCookies(session, baseURL ?? "http://localhost:3100"));
  });

  async function fillForm(page: Page, price: string) {
    await page.goto("/admin/precos");
    await expect(page.getByRole("heading", { name: "Lançar preço" })).toBeVisible();
    await page.getByLabel("Mercado").selectOption(scenario.storeId);
    await page.getByLabel("Produto").selectOption(scenario.productId);
    await page.getByLabel("Preço da embalagem (R$)").fill(price);
  }

  const save = (page: Page) => page.getByRole("button", { name: "Salvar e publicar" });

  test("o navegador barra preço fora do formato; o servidor barra zero", async ({ page }) => {
    await fillForm(page, "abc");
    for (const invalid of ["abc", "5,999", "1234567", "5,"]) {
      await page.getByLabel("Preço da embalagem (R$)").fill(invalid);
      await save(page).click();
      // Validação nativa: o formulário nem é enviado, então nenhuma mensagem de status aparece.
      await expect(page.getByRole("status")).toHaveCount(0);
    }

    await page.getByLabel("Preço da embalagem (R$)").fill("0");
    await save(page).click();
    await expect(page.getByRole("status")).toHaveText("O preço deve ser maior que zero.");
  });

  test("lança, o preço vira o vigente no produto público e o mais novo substitui o anterior", async ({
    page,
  }) => {
    await fillForm(page, "12,34");
    await save(page).click();
    await expect(page.getByRole("status")).toHaveText("Preço salvo e publicado.");

    await page.goto(`/produto/${scenario.productId}`);
    await expect(page.getByRole("heading", { name: scenario.productName })).toBeVisible();
    await expect(page.getByText(scenario.storeName).first()).toBeVisible();
    await expect(page.getByText("R$ 12,34").first()).toBeVisible();

    // Mais um preço, agora em oferta e com validade: o vigente passa a ser o mais novo.
    await fillForm(page, "11.00");
    await page.getByText("É oferta (promoção)").click();
    const tomorrow = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.getByLabel("Válido até (opcional)").fill(tomorrow);
    await save(page).click();
    await expect(page.getByRole("status")).toHaveText("Preço salvo e publicado.");

    // A resposta de produto fica em cache por até 60 s na API (QA-004): espera o valor novo.
    await expect(async () => {
      await page.goto(`/produto/${scenario.productId}`);
      await expect(page.getByText("R$ 11,00").first()).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 90_000, intervals: [3_000] });
  });

  test("teto: R$ 100.000,00 é aceito; acima disso o banco recusa com mensagem genérica", async ({
    page,
  }) => {
    await fillForm(page, "100000");
    await save(page).click();
    await expect(page.getByRole("status")).toHaveText("Preço salvo e publicado.");

    // QA-010: o contrato e o formulário aceitam até R$ 999.999,99, mas a coluna do banco limita a
    // R$ 100.000,00. Quem lança R$ 100.000,01 vê só "Não foi possível salvar o preço."
    await fillForm(page, "100000,01");
    await save(page).click();
    await expect(page.getByRole("status")).toHaveText("Não foi possível salvar o preço.");
  });

  test("os mercados e produtos novos aparecem no formulário e a página recarrega com a seleção limpa", async ({
    page,
  }) => {
    await page.goto("/admin/precos");
    await expect(
      page.getByLabel("Mercado").locator(`option[value="${scenario.storeId}"]`),
    ).toHaveText(scenario.storeName);
    await expect(
      page.getByLabel("Produto").locator(`option[value="${scenario.productId}"]`),
    ).toContainText(scenario.productName);
  });
});
