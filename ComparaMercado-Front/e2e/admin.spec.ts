import { expect, test } from "@playwright/test";
import { hasLocalSupabase, sessionCookies, signInAsAdmin } from "./support/session";

// Caminho autenticado ponta a ponta: cookie de sessão -> Next -> API (valida o token e o papel)
// -> Postgres sob RLS. Só leitura. Usa o admin do seed LOCAL e nunca roda fora de localhost.

test.describe("admin autenticado", () => {
  test.skip(!hasLocalSupabase, "exige o Supabase local");

  test.beforeEach(async ({ context, baseURL }) => {
    const session = await signInAsAdmin();
    await context.addCookies(sessionCookies(session, baseURL ?? "http://localhost:3100"));
  });

  test("a conta mostra o papel e o painel carrega os números pela API", async ({ page }) => {
    await page.goto("/conta");
    await expect(page.getByText("admin@local.test")).toBeVisible();
    await expect(page.getByRole("link", { name: "Painel interno" })).toBeVisible();

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Painel interno" })).toBeVisible();
    await expect(page.getByText("Preços vigentes")).toBeVisible();
    await expect(page.getByText("Mercados ativos")).toBeVisible();
  });

  test("o formulário de preço lista mercados e produtos vindos da API", async ({ page }) => {
    await page.goto("/admin/precos");
    await expect(page.getByRole("heading", { name: "Lançar preço" })).toBeVisible();
    await expect(page.getByLabel("Mercado").locator("option").first()).toBeAttached();
    expect(await page.getByLabel("Produto").locator("option").count()).toBeGreaterThan(10);
  });

  test("a fila de revisão abre", async ({ page }) => {
    await page.goto("/admin/revisao");
    await expect(page.getByRole("heading", { name: "Fila de revisão" })).toBeVisible();
  });
});
