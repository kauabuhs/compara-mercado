import { expect, type Page, test } from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  createConfirmedUser,
  hasLocalSupabase,
  newTestCredentials,
  waitForEmailLink,
} from "./support/session";

// Acesso à conta ponta a ponta, num navegador de verdade: cadastro com confirmação por e-mail,
// login com senha, perfil, "esqueci a senha" e a guarda do /admin. Os e-mails são lidos no Mailpit
// do Supabase local. Cria usuários descartáveis no banco local; nunca roda fora de localhost.

async function signInThroughUi(page: Page, email: string, password: string, next?: string) {
  await page.goto(next ? `/entrar?next=${encodeURIComponent(next)}` : "/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test.describe("acesso à conta", () => {
  test.skip(!hasLocalSupabase, "exige o Supabase local");

  test("cadastro: confirma o e-mail pelo link, entra e edita o perfil", async ({ page }) => {
    const { email, password } = newTestCredentials("cadastro");

    await page.goto("/cadastro");
    await page.getByLabel("Como quer ser chamado?").fill("Maria Teste");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByLabel(/Li e aceito os/).check();
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByRole("heading", { name: "Confira o seu e-mail" })).toBeVisible();

    // O link do e-mail confirma a conta e já abre a sessão neste navegador.
    await page.goto(await waitForEmailLink(email, "Confirme seu e-mail"));
    await expect(page).toHaveURL(/\/conta$/);
    await expect(page.getByText("Maria Teste")).toBeVisible();

    await page.goto("/conta/perfil");
    // Espera o React assumir o formulário: o que for digitado antes disso é descartado na hidratação.
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Telefone (opcional)").fill("54999990000");
    await page.getByLabel("Cidade (opcional)").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Dados salvos.")).toBeVisible();

    await page.reload();
    // A API guarda em E.164 e a tela mostra no formato brasileiro.
    await expect(page.getByLabel("Telefone (opcional)")).toHaveValue("(54) 99999-0000");
  });

  test("cadastro recusa senha fraca e termos não aceitos antes de falar com o servidor de e-mail", async ({
    page,
  }) => {
    await page.goto("/cadastro");
    await page.getByLabel("Como quer ser chamado?").fill("Maria");
    await page.getByLabel("E-mail").fill("fraca@test.local");
    await page.getByLabel("Senha", { exact: true }).fill("curta");
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "A senha precisa ter" })).toBeVisible();
    // O que a pessoa digitou continua lá (o formulário não é limpo no erro).
    await expect(page.getByLabel("E-mail")).toHaveValue("fraca@test.local");

    await page.getByLabel("Senha", { exact: true }).fill("SenhaForte2026");
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByText("aceite os Termos de Uso")).toBeVisible();
  });

  test("login: senha errada não diz qual dado falhou", async ({ page }) => {
    const { email } = await createConfirmedUser("login");
    await signInThroughUi(page, email, "SenhaErrada123");
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
    await signInThroughUi(page, "naoexiste@test.local", "SenhaErrada123");
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  });

  test("esqueci a senha: link do e-mail, nova senha e login com ela", async ({ page, context }) => {
    const { email, password } = await createConfirmedUser("reset");
    const newPassword = `${password}x`;

    await page.goto("/recuperar-senha");
    await page.getByLabel("E-mail da conta").fill(email);
    await page.getByRole("button", { name: "Enviar link de recuperação" }).click();
    await expect(page.getByRole("heading", { name: "Confira o seu e-mail" })).toBeVisible();

    await page.goto(await waitForEmailLink(email, "Redefina sua senha"));
    await expect(page).toHaveURL(/\/nova-senha$/);

    // A senha atual não vale como "nova".
    await page.getByLabel("Nova senha").fill(password);
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page.getByText("Escolha uma senha diferente da atual.").first()).toBeVisible();

    await page.getByLabel("Nova senha").fill(newPassword);
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page).toHaveURL(/\/conta\?aviso=senha-alterada$/);
    await expect(page.getByText("Senha alterada.")).toBeVisible();

    // Sai (apaga a sessão do navegador) e entra de novo com a senha nova; a antiga não vale mais.
    await context.clearCookies();
    await signInThroughUi(page, email, password);
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
    await signInThroughUi(page, email, newPassword);
    await expect(page).toHaveURL(/\/conta$/);
  });

  test("esqueci a senha responde igual para e-mail sem conta", async ({ page }) => {
    await page.goto("/recuperar-senha");
    await page.getByLabel("E-mail da conta").fill("ninguem@test.local");
    await page.getByRole("button", { name: "Enviar link de recuperação" }).click();
    await expect(page.getByText("Se existir uma conta com esse e-mail")).toBeVisible();
  });
});

test.describe("entrada no /admin", () => {
  test.skip(!hasLocalSupabase, "exige o Supabase local");

  test("visitante é levado a entrar e volta ao painel depois do login do admin", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/entrar\?next=\/admin$/);
    await expect(page.getByText("Entre com a sua conta de administrador")).toBeVisible();

    await page.getByLabel("E-mail").fill(ADMIN_EMAIL);
    await page.getByLabel("Senha", { exact: true }).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Painel interno" })).toBeVisible();
  });

  test("usuário comum não entra no painel e vê o motivo", async ({ page }) => {
    const { email, password } = await createConfirmedUser("semadmin");
    await signInThroughUi(page, email, password, "/admin");
    await expect(page).toHaveURL(/\/conta\?aviso=sem-permissao$/);
    await expect(page.getByText("Esta área é só para administradores.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Painel interno/ })).toHaveCount(0);
  });

  test("destino fora da lista é ignorado (sem redirecionamento aberto)", async ({ page }) => {
    await signInThroughUi(page, ADMIN_EMAIL, ADMIN_PASSWORD, "https://evil.example/roubo");
    await expect(page).toHaveURL(/\/conta$/);
    expect(new URL(page.url()).origin).not.toContain("evil");
  });
});
