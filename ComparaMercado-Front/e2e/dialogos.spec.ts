import { expect, test } from "@playwright/test";

// Sheets de detalhes: no mobile sobem ancorados na base da tela; no desktop (≥ 64rem, o mesmo
// breakpoint em que a navegação vira sidebar) abrem como modal centralizado.
test("sheet 'Privacidade e dados' ancora na base no mobile e centraliza no desktop", async ({
  page,
}, testInfo) => {
  await page.goto("/conta");
  await page.getByRole("button", { name: /^Privacidade e dados/ }).click();

  const dialog = page.getByRole("dialog", { name: "Privacidade e dados" });
  await expect(dialog).toBeVisible();
  // Espera a animação de entrada terminar antes de medir.
  await expect.poll(async () => dialog.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");

  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error("sem medidas do diálogo/viewport");
  const gapTop = box.y;
  const gapBottom = viewport.height - (box.y + box.height);

  if (testInfo.project.name === "mobile") {
    expect(gapBottom).toBeLessThan(2); // colado na borda de baixo
    await expect(dialog.locator("div[aria-hidden]").first()).toBeVisible(); // alça de arrastar
  } else {
    expect(Math.abs(gapTop - gapBottom)).toBeLessThan(2); // centrado na vertical
    await expect(dialog.locator("div[aria-hidden]").first()).toBeHidden(); // sem alça
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
