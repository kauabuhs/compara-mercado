import { expect, type Locator, type Page, test } from "@playwright/test";
import { hasLocalSupabase, sessionCookies, signInAsAdmin } from "./support/session";

// CRUD do cadastro-base pelo painel (cidades, categorias, produtos e mercados): criar, validar,
// buscar, filtrar por situação, editar, desativar/arquivar (com confirmação) e reativar, além do
// efeito no lado público. Nada é apagado no sistema: "remover" aqui é desativar. Usa o admin do
// seed LOCAL; cada execução cria registros com nome único (o banco local aceita o acúmulo).

test.describe("admin: cadastro-base", () => {
  test.skip(!hasLocalSupabase, "exige o Supabase local");

  test.beforeEach(async ({ context, baseURL }) => {
    const session = await signInAsAdmin();
    await context.addCookies(sessionCookies(session, baseURL ?? "http://localhost:3100"));
  });

  // ── utilitários ───────────────────────────────────────────────────────────────────────────────
  const unique = (label: string, projectName: string) =>
    `QA ${label} ${projectName} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

  /** Bloco recolhível de cadastro novo ("Cadastrar cidade"…): abre e devolve o escopo dele. */
  async function openNewRecord(page: Page, title: string): Promise<Locator> {
    const block = page.locator("details").filter({ has: page.getByText(title, { exact: true }) });
    await block.getByText(title, { exact: true }).click();
    return block;
  }

  /** Linha da listagem que contém o texto, já com a edição aberta quando pedido. */
  function row(page: Page, text: string): Locator {
    return page.getByRole("listitem").filter({ hasText: text });
  }

  async function openEdit(item: Locator): Promise<void> {
    await item.getByText("Editar", { exact: true }).click();
  }

  async function search(page: Page, label: string, term: string, situation?: string) {
    await page.getByRole("searchbox", { name: label }).fill(term);
    if (situation !== undefined) {
      await page.locator('select[name="situacao"]').selectOption(situation);
    }
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await page.waitForLoadState("networkidle");
  }

  async function confirmDialog(page: Page, title: RegExp, confirmLabel: string) {
    const dialog = page.getByRole("dialog").filter({ hasText: title });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: confirmLabel }).click();
    await expect(dialog).toBeHidden();
  }

  /** GTIN-13 válido a partir de 12 dígitos-base (dígito verificador módulo 10). */
  function gtin13(base12: string): string {
    const sum = [...base12].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
    return `${base12}${(10 - (sum % 10)) % 10}`;
  }
  const randomDigits = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

  // ── cidades ───────────────────────────────────────────────────────────────────────────────────
  test("cidades: valida, cadastra, busca, edita, desabilita e habilita", async ({ page }, info) => {
    const name = unique("Cidade", info.project.name);
    const renamed = `${name} Editada`;
    const ibge = `9${randomDigits(6)}`;

    await page.goto("/admin/cidades");
    await expect(page.getByRole("heading", { name: "Cidades" })).toBeVisible();

    const form = await openNewRecord(page, "Cadastrar cidade");

    // Validação do navegador: UF com 1 letra e IBGE com 6 dígitos não enviam o formulário.
    await form.getByLabel("Nome da cidade").fill(name);
    await form.getByLabel("UF").fill("R");
    await form.getByLabel("Código do IBGE").fill("123456");
    await form.getByRole("button", { name: "Cadastrar" }).click();
    await expect(form.getByRole("status")).toHaveCount(0);

    await form.getByLabel("UF").fill("RS");
    await form.getByLabel("Código do IBGE").fill(ibge);
    await form.getByText("Habilitada no comparador").click();
    await form.getByRole("button", { name: "Cadastrar" }).click();
    await expect(form.getByRole("status")).toContainText(/salv|cadastr/i);
    // ao criar com sucesso o formulário é limpo
    await expect(form.getByLabel("Nome da cidade")).toHaveValue("");

    // Duplicado (mesmo código do IBGE): 409 com mensagem em português, sem perder o que foi digitado.
    await form.getByLabel("Nome da cidade").fill(`${name} Repetida`);
    await form.getByLabel("UF").fill("RS");
    await form.getByLabel("Código do IBGE").fill(ibge);
    await form.getByRole("button", { name: "Cadastrar" }).click();
    await expect(form.getByRole("status")).toContainText(/já existe/i);
    await expect(form.getByLabel("Nome da cidade")).toHaveValue(`${name} Repetida`);

    // Busca encontra; busca sem resultado mostra o estado vazio.
    await search(page, "Buscar cidade pelo nome", name);
    await expect(row(page, name).first()).toBeVisible();
    await expect(row(page, name).first()).toContainText("habilitada");
    await search(page, "Buscar cidade pelo nome", "zzzz-nao-existe-qa");
    await expect(page.getByText("Nenhuma cidade encontrada")).toBeVisible();

    // Editar o nome (UF e IBGE são imutáveis e só aparecem como texto).
    await search(page, "Buscar cidade pelo nome", name);
    const item = row(page, name).first();
    await openEdit(item);
    await expect(item.getByLabel("UF")).toHaveCount(0);
    await item.getByLabel("Nome da cidade").fill(renamed);
    await item.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(item.getByRole("status")).toBeVisible();

    // Desabilitar pede confirmação (cancelar não muda nada); confirmar muda a situação.
    await search(page, "Buscar cidade pelo nome", renamed);
    await row(page, renamed).first().getByRole("button", { name: "Desabilitar" }).click();
    const cancelDialog = page.getByRole("dialog").filter({ hasText: /Desabilitar/ });
    await expect(cancelDialog).toBeVisible();
    await cancelDialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(cancelDialog).toBeHidden();
    await expect(row(page, renamed).first()).toContainText("habilitada");

    await row(page, renamed).first().getByRole("button", { name: "Desabilitar" }).click();
    await confirmDialog(page, /Desabilitar/, "Desabilitar");
    await expect(row(page, renamed).first()).toContainText("desabilitada");

    // Filtro por situação: aparece em "Desabilitadas", some de "Habilitadas".
    await search(page, "Buscar cidade pelo nome", renamed, "inativos");
    await expect(row(page, renamed).first()).toBeVisible();
    await search(page, "Buscar cidade pelo nome", renamed, "ativos");
    await expect(page.getByText("Nenhuma cidade encontrada")).toBeVisible();

    // Habilitar de novo é direto, sem confirmação.
    await search(page, "Buscar cidade pelo nome", renamed, "inativos");
    await row(page, renamed).first().getByRole("button", { name: "Habilitar" }).click();
    // espera a ação terminar: a cidade sai do filtro "Desabilitadas"
    await expect(page.getByText("Nenhuma cidade encontrada")).toBeVisible();
    await search(page, "Buscar cidade pelo nome", renamed, "ativos");
    await expect(row(page, renamed).first()).toContainText("habilitada");
  });

  // ── categorias ────────────────────────────────────────────────────────────────────────────────
  test("categorias: identificador válido e único, subcategoria e edição", async ({
    page,
  }, info) => {
    const name = unique("Categoria", info.project.name);
    const slug = `qa-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

    await page.goto("/admin/categorias");
    await expect(page.getByRole("heading", { name: "Categorias" })).toBeVisible();
    const form = await openNewRecord(page, "Cadastrar categoria");

    // Identificador com maiúscula/acento/espaço é barrado pelo navegador (pattern).
    await form.getByLabel("Nome da categoria").fill(name);
    await form.getByLabel("Identificador").fill("Inválido Com Espaço");
    await form.getByRole("button", { name: "Cadastrar" }).click();
    await expect(form.getByRole("status")).toHaveCount(0);

    await form.getByLabel("Identificador").fill(slug);
    await form.getByRole("button", { name: "Cadastrar" }).click();
    await expect(form.getByRole("status")).toContainText(/salv|cadastr/i);

    // Mesmo identificador de novo: 409 com mensagem amigável.
    await form.getByLabel("Nome da categoria").fill(`${name} 2`);
    await form.getByLabel("Identificador").fill(slug);
    await form.getByRole("button", { name: "Cadastrar" }).click();
    await expect(form.getByRole("status")).toContainText(/já existe/i);

    // Subcategoria dentro da primeira.
    await page.reload();
    const form2 = await openNewRecord(page, "Cadastrar categoria");
    await form2.getByLabel("Nome da categoria").fill(`${name} Filha`);
    await form2.getByLabel("Identificador").fill(`${slug}-filha`);
    await form2.getByLabel("Dentro de (opcional)").selectOption({ label: name });
    await form2.getByRole("button", { name: "Cadastrar" }).click();
    await expect(form2.getByRole("status")).toContainText(/salv|cadastr/i);

    // Busca e edição: a categoria não pode ser "filha dela mesma" (não aparece na própria lista).
    await search(page, "Buscar categoria pelo nome", name);
    const item = row(page, name).first();
    await openEdit(item);
    await expect(
      item
        .getByLabel("Dentro de (opcional)")
        .locator("option")
        .filter({ hasText: new RegExp(`^${name}$`) }),
    ).toHaveCount(0);
    await item.getByLabel("Nome da categoria").fill(`${name} Renomeada`);
    await item.getByRole("button", { name: "Salvar alterações" }).click();
    // a lista reordena por nome: confirma pelo dado persistido, buscando o novo nome
    await expect(async () => {
      await search(page, "Buscar categoria pelo nome", `${name} Renomeada`);
      await expect(row(page, `${name} Renomeada`).first()).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
  });

  // ── produtos ──────────────────────────────────────────────────────────────────────────────────
  test("produtos: GTIN, duplicado, edição, arquivar/reativar e efeito na busca pública", async ({
    page,
  }, info) => {
    test.setTimeout(240_000);
    const name = unique("Produto", info.project.name).replace(/\d+$/, "");
    const gtin = gtin13(randomDigits(12));
    // 12 dígitos-base + verificador errado de propósito
    const badGtin = `${gtin.slice(0, 12)}${(Number(gtin[12]) + 1) % 10}`;

    await page.goto("/admin/produtos");
    await expect(page.getByRole("heading", { name: "Produtos" })).toBeVisible();
    const form = await openNewRecord(page, "Cadastrar produto");

    // Tamanho é obrigatório (navegador); nome com 1 letra também.
    await form.getByLabel("Nome do produto").fill("Q");
    await form.getByRole("button", { name: "Cadastrar" }).click();
    await expect(form.getByRole("status")).toHaveCount(0);

    // GTIN com dígito verificador errado é recusado pela API.
    await form.getByLabel("Nome do produto").fill(name);
    await form.getByLabel("Marca (opcional)").fill("Marca QA");
    await form.getByLabel("Tamanho da embalagem").fill("2");
    await form.getByLabel("Unidade").selectOption("kg");
    await form.getByLabel("Código de barras (opcional)").fill(badGtin);
    await form.getByRole("button", { name: "Cadastrar" }).click();
    await expect(form.getByRole("status")).toBeVisible();
    await expect(form.getByRole("status")).not.toContainText(/salv|cadastr/i);
    // erro não apaga o que foi digitado
    await expect(form.getByLabel("Nome do produto")).toHaveValue(name);

    await form.getByLabel("Código de barras (opcional)").fill(gtin);
    await form.getByRole("button", { name: "Cadastrar" }).click();
    await expect(form.getByRole("status")).toContainText(/salv|cadastr/i);

    // GTIN repetido: 409.
    await form.getByLabel("Nome do produto").fill(`${name} Gêmeo`);
    await form.getByLabel("Tamanho da embalagem").fill("2");
    await form.getByLabel("Código de barras (opcional)").fill(gtin);
    await form.getByRole("button", { name: "Cadastrar" }).click();
    await expect(form.getByRole("status")).toContainText(/já existe/i);

    // Busca por nome e por código de barras.
    await search(page, "Buscar por nome ou código de barras", gtin);
    const item = row(page, name).first();
    await expect(item).toBeVisible();
    await expect(item).toContainText(`GTIN ${gtin}`);
    await expect(item).toContainText("ativo");

    // Edita o tamanho.
    await openEdit(item);
    await item.getByLabel("Tamanho da embalagem").fill("5");
    await item.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(item.getByRole("status")).toBeVisible();

    // Efeito público: o produto ativo é achado na busca.
    await page.goto(`/busca?q=${encodeURIComponent(name)}`);
    await expect(page.getByText(name).first()).toBeVisible();

    // Arquivar (com confirmação) tira da busca pública imediatamente.
    await page.goto("/admin/produtos");
    await search(page, "Buscar por nome ou código de barras", gtin);
    await row(page, name).first().getByRole("button", { name: "Arquivar" }).click();
    await confirmDialog(page, /Arquivar/, "Arquivar");
    await expect(row(page, name).first()).toContainText("arquivado");

    // O cache público da API vale 60 s e o admin não o invalida (QA-005): o contrato verificável é
    // "some em até 60 s". Quando o cache passar a ser invalidado na escrita, este poll passa na 1ª.
    await expect(async () => {
      await page.goto(`/busca?q=${encodeURIComponent(name)}`);
      // a busca tolera erro de digitação e pode listar outros "QA …": o que importa é o nome exato
      await expect(page.getByText(name, { exact: true })).toHaveCount(0, { timeout: 2_000 });
    }).toPass({ timeout: 80_000, intervals: [5_000] });

    // Filtro "Arquivados" mostra; reativar volta a ativo e a busca pública volta a achar.
    await page.goto("/admin/produtos");
    await search(page, "Buscar por nome ou código de barras", gtin, "inativos");
    await row(page, name).first().getByRole("button", { name: "Reativar" }).click();
    await expect(page.getByText("Nenhum produto encontrado")).toBeVisible();
    await search(page, "Buscar por nome ou código de barras", gtin, "ativos");
    await expect(row(page, name).first()).toContainText("ativo");
    await expect(async () => {
      await page.goto(`/busca?q=${encodeURIComponent(name)}`);
      await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 80_000, intervals: [5_000] });
  });

  // ── mercados ──────────────────────────────────────────────────────────────────────────────────
  test("mercados: cidade habilitada, coordenadas, edição e inativação", async ({ page }, info) => {
    const cityName = unique("CidadeM", info.project.name);
    const storeName = unique("Mercado", info.project.name);

    // pré-condição: uma cidade habilitada só para este teste
    await page.goto("/admin/cidades");
    const cityForm = await openNewRecord(page, "Cadastrar cidade");
    await cityForm.getByLabel("Nome da cidade").fill(cityName);
    await cityForm.getByLabel("UF").fill("SC");
    await cityForm.getByLabel("Código do IBGE").fill(`9${randomDigits(6)}`);
    await cityForm.getByText("Habilitada no comparador").click();
    await cityForm.getByRole("button", { name: "Cadastrar" }).click();
    await expect(cityForm.getByRole("status")).toContainText(/salv|cadastr/i);

    await page.goto("/admin/mercados");
    await expect(page.getByRole("heading", { name: "Mercados" })).toBeVisible();
    const form = await openNewRecord(page, "Cadastrar mercado");
    await form.getByLabel("Nome do mercado").fill(storeName);
    await form.getByLabel("Cidade", { exact: true }).selectOption({ label: cityName });

    // Coordenada fora do intervalo é recusada.
    await form.getByLabel("Latitude").fill("-95");
    await form.getByLabel("Longitude").fill("-51,5");
    await form.getByRole("button", { name: "Cadastrar" }).click();
    await expect(form.getByRole("status")).toBeVisible();
    await expect(form.getByRole("status")).not.toContainText(/salv|cadastr/i);

    // Vírgula decimal é aceita.
    await form.getByLabel("Latitude").fill("-29,1678");
    await form.getByLabel("Longitude").fill("-51,5167");
    await form.getByLabel("Bairro (opcional)").fill("Centro QA");
    await form.getByRole("button", { name: "Cadastrar" }).click();
    await expect(form.getByRole("status")).toContainText(/salv|cadastr/i);

    await search(page, "Buscar mercado pelo nome", storeName);
    const item = row(page, storeName).first();
    await expect(item).toBeVisible();
    await expect(item).toContainText(/ativo/i);

    // Edita o bairro.
    await openEdit(item);
    await item.getByLabel("Bairro (opcional)").fill("Bairro Editado QA");
    await item.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(item.getByRole("status")).toBeVisible();

    // Inativar pede confirmação; depois aparece no filtro de inativos.
    await search(page, "Buscar mercado pelo nome", storeName);
    await row(page, storeName)
      .first()
      .getByRole("button", { name: /Inativar|Desativar/ })
      .click();
    await confirmDialog(page, /Inativar|Desativar/, "Inativar");
    await search(page, "Buscar mercado pelo nome", storeName, "inativos");
    await expect(row(page, storeName).first()).toBeVisible();
  });

  // ── autorização ───────────────────────────────────────────────────────────────────────────────
  test("as 4 listagens do cadastro respondem ao admin e a navegação tem as 8 abas", async ({
    page,
  }) => {
    for (const path of [
      "/admin/cidades",
      "/admin/mercados",
      "/admin/categorias",
      "/admin/produtos",
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
    }
    const nav = page.getByRole("navigation", { name: /admin|painel/i });
    for (const tab of [
      "Resumo",
      "Lançar preços",
      "Fila de revisão",
      "Moderação",
      "Produtos",
      "Mercados",
      "Cidades",
      "Categorias",
    ]) {
      await expect(nav.getByRole("link", { name: tab })).toBeVisible();
    }
  });
});
