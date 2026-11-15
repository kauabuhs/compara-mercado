import { expect, type Page } from "@playwright/test";

// Passos de "enviar um preço com foto" compartilhados entre os specs que precisam de uma
// publicação real (contribuição, comunidade). Tudo pela interface, como uma pessoa faria.

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
export function uniquePrice(projectName: string) {
  const reais = projectName === "mobile" ? 3 : 4;
  const cents = 10 + Math.floor(Math.random() * 90);
  // `(?!\d)` e não `\b`: no cartão o preço vem colado ao texto seguinte ("R$ 4,24Aprovar").
  return { typed: `${reais},${cents}`, pattern: new RegExp(`R\\$\\s*${reais},${cents}(?!\\d)`) };
}

/** Preenche e envia o formulário como o usuário faria. Devolve o produto escolhido. */
export async function submitPrice(page: Page, price: string): Promise<string> {
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
