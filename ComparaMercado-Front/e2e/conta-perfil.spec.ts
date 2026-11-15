import { expect, type Page, test } from "@playwright/test";
import { hasLocalSupabase, sessionCookies, signUpNewUser } from "./support/session";

// Perfil da conta (/conta/perfil): nome, apelido público (formato, único sem diferenciar
// maiúsculas, reservados), telefone, cidade, texto malicioso e a tela de reputação. Cada teste usa
// uma pessoa descartável. Só roda contra o Supabase LOCAL.

test.describe("conta: perfil", () => {
  test.skip(!hasLocalSupabase, "exige o Supabase local");

  async function openProfileAs(
    browser: import("@playwright/test").Browser,
    baseURL: string | undefined,
    label: string,
  ): Promise<{ page: Page; close: () => Promise<void> }> {
    const origin = baseURL ?? "http://localhost:3100";
    const context = await browser.newContext({ baseURL: origin });
    await context.addCookies(sessionCookies(await signUpNewUser(label), origin));
    const page = await context.newPage();
    await page.goto("/conta/perfil");
    await expect(page.getByLabel("Como quer ser chamado?")).toBeVisible();
    return { page, close: () => context.close() };
  }

  const save = (page: Page) => page.getByRole("button", { name: "Salvar", exact: true }).click();

  test("sem sessão, o perfil leva a entrar e volta para a tela", async ({ page }) => {
    await page.goto("/conta/perfil");
    await expect(page).toHaveURL(/\/entrar/);
  });

  test("nome: curto demais é recusado com o motivo no campo", async ({ browser, baseURL }) => {
    const { page, close } = await openProfileAs(browser, baseURL, "perfil-nome");
    await page.getByLabel("Como quer ser chamado?").fill("A");
    await save(page);
    await expect(page.getByText("Use de 2 a 40 caracteres.").first()).toBeVisible();

    await page.getByLabel("Como quer ser chamado?").fill("   ");
    await save(page);
    await expect(page.getByText("Use de 2 a 40 caracteres.").first()).toBeVisible();

    await page.getByLabel("Como quer ser chamado?").fill("Maria Silva");
    await save(page);
    await expect(page.getByText("Dados salvos.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Como quer ser chamado?")).toHaveValue("Maria Silva");
    await close();
  });

  test("apelido: formato inválido é recusado; válido salva; apagar volta ao anônimo", async ({
    browser,
    baseURL,
  }) => {
    const { page, close } = await openProfileAs(browser, baseURL, "perfil-apelido");
    await page.getByLabel("Como quer ser chamado?").fill("Pessoa QA");

    const formatMessage = "Use de 2 a 24 caracteres: letras, números, espaço, ponto, hífen ou _.";
    for (const invalid of ["a", "@alguém", "nome!", "-começa", "<b>x</b>"]) {
      await page.getByLabel("Apelido na Comunidade (opcional)").fill(invalid);
      await save(page);
      await expect(page.getByText(formatMessage).first(), invalid).toBeVisible();
    }

    // o campo já limita a digitação em 24 caracteres
    await expect(page.getByLabel("Apelido na Comunidade (opcional)")).toHaveAttribute(
      "maxlength",
      "24",
    );

    const nickname = `Zé do QA ${Date.now() % 100000}`;
    await page.getByLabel("Apelido na Comunidade (opcional)").fill(nickname);
    await save(page);
    await expect(page.getByText("Dados salvos.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Apelido na Comunidade (opcional)")).toHaveValue(nickname);

    // depois de salvar, um valor inválido volta a mostrar o erro (a mensagem de sucesso some)
    await page.getByLabel("Apelido na Comunidade (opcional)").fill("@@");
    await save(page);
    await expect(page.getByText(formatMessage).first()).toBeVisible();
    await expect(page.getByText("Dados salvos.")).toHaveCount(0);

    // apagar: volta a "Colaborador #XXXX" (campo vazio)
    await page.getByLabel("Apelido na Comunidade (opcional)").fill("");
    await save(page);
    await expect(page.getByText("Dados salvos.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Apelido na Comunidade (opcional)")).toHaveValue("");
    await close();
  });

  test("apelido: reservado e repetido (sem diferenciar maiúsculas) não passam", async ({
    browser,
    baseURL,
  }) => {
    const first = await openProfileAs(browser, baseURL, "perfil-reserva-a");
    const second = await openProfileAs(browser, baseURL, "perfil-reserva-b");

    await first.page.getByLabel("Como quer ser chamado?").fill("Pessoa Um");
    await second.page.getByLabel("Como quer ser chamado?").fill("Pessoa Dois");

    for (const reserved of ["admin", "Equipe", "moderação"]) {
      await first.page.getByLabel("Apelido na Comunidade (opcional)").fill(reserved);
      await save(first.page);
      await expect(first.page.getByText("Dados salvos."), reserved).toHaveCount(0);
      await expect(
        first.page
          .getByRole("alert")
          .or(first.page.getByText(/indispon|escolha outro|não pode/i))
          .first(),
        reserved,
      ).toBeVisible();
    }

    const nickname = `Unico ${Date.now() % 1000000}`;
    await first.page.getByLabel("Apelido na Comunidade (opcional)").fill(nickname);
    await save(first.page);
    await expect(first.page.getByText("Dados salvos.")).toBeVisible();

    await second.page.getByLabel("Apelido na Comunidade (opcional)").fill(nickname.toUpperCase());
    await save(second.page);
    await expect(second.page.getByText("Dados salvos.")).toHaveCount(0);
    await expect(
      second.page
        .getByRole("alert")
        .or(second.page.getByText(/indispon|escolha outro|em uso/i))
        .first(),
    ).toBeVisible();

    await first.close();
    await second.close();
  });

  test("telefone: inválido é recusado; válido é guardado e volta formatado", async ({
    browser,
    baseURL,
  }) => {
    const { page, close } = await openProfileAs(browser, baseURL, "perfil-fone");
    await page.getByLabel("Como quer ser chamado?").fill("Pessoa Fone");

    for (const invalid of ["123", "abcdefghij", "(54) 9999", "+999 1"]) {
      await page.getByLabel("Telefone (opcional)").fill(invalid);
      await save(page);
      await expect(page.getByText("Dados salvos."), invalid).toHaveCount(0);
      await expect(
        page
          .getByRole("alert")
          .or(page.getByText(/telefone/i).first())
          .first(),
        invalid,
      ).toBeVisible();
    }

    await page.getByLabel("Telefone (opcional)").fill("(54) 99999-0000");
    await save(page);
    await expect(page.getByText("Dados salvos.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Telefone (opcional)")).toHaveValue(/\(?54\)?\s?9?9999-?0000/);

    // apagar o telefone
    await page.getByLabel("Telefone (opcional)").fill("");
    await save(page);
    await expect(page.getByText("Dados salvos.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Telefone (opcional)")).toHaveValue("");
    await close();
  });

  test("cidade: escolher, manter ao recarregar e voltar para 'Não informar'", async ({
    browser,
    baseURL,
  }) => {
    const { page, close } = await openProfileAs(browser, baseURL, "perfil-cidade");
    await page.getByLabel("Como quer ser chamado?").fill("Pessoa Cidade");
    const select = page.getByLabel("Cidade (opcional)");
    await expect(select.locator("option").first()).toHaveText("Não informar");
    await select.selectOption({ label: "Caxias do Sul - RS" });
    await save(page);
    await expect(page.getByText("Dados salvos.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Cidade (opcional)")).toHaveValue(
      "10000000-0000-4000-8000-000000000001",
    );

    await page.getByLabel("Cidade (opcional)").selectOption("");
    await save(page);
    await expect(page.getByText("Dados salvos.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Cidade (opcional)")).toHaveValue("");
    await close();
  });

  test("texto malicioso no nome é mostrado como texto e não executa", async ({
    browser,
    baseURL,
  }) => {
    const { page, close } = await openProfileAs(browser, baseURL, "perfil-xss");
    const payload = "<img src=x onerror=window.__xss=1>";
    await page.getByLabel("Como quer ser chamado?").fill(payload);
    await save(page);
    await expect(page.getByText("Dados salvos.")).toBeVisible();

    await page.goto("/conta");
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBe(
      undefined,
    );
    await expect(page.locator("main img[src='x']")).toHaveCount(0);
    await close();
  });

  test("a e-mail é só leitura e a reputação de quem começa mostra o nível inicial", async ({
    browser,
    baseURL,
  }) => {
    const { page, close } = await openProfileAs(browser, baseURL, "perfil-rep");
    await expect(page.getByLabel("E-mail")).toHaveAttribute("readonly", "");

    await page.goto("/conta/reputacao");
    await expect(page.getByRole("heading", { name: "Minha reputação", level: 1 })).toBeVisible();
    await expect(page.getByText("Ainda sem pontos")).toBeVisible();
    await expect(page.getByText("pontos").first()).toBeVisible();
    await close();
  });
});
