import { expect, type Page, test } from "@playwright/test";

// Recursos que dependem do navegador real: WebGL/worker do mapa, geolocalização, service worker
// (offline), compartilhamento e layout em telas pequenas. WebGL por software: o Chromium headless
// não tem GPU e, sem estes argumentos, o mapa nem monta.
test.use({
  launchOptions: {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  },
});

// Centro de Caxias do Sul (cidade do seed). Os mercados do seed ficam a poucos km daqui.
const CAXIAS = { latitude: -29.1685, longitude: -51.1794 };

async function addFirstResultToList(page: Page, term: string) {
  await page.goto(`/busca?q=${encodeURIComponent(term)}`);
  await page
    .getByRole("list", { name: /Resultados/ })
    .getByRole("link")
    .first()
    .click();
  await page.getByRole("button", { name: /Adicionar .* à lista/ }).click();
  await expect(page.getByText("Adicionado")).toBeVisible();
}

test.describe("mapa", () => {
  test("monta com marcadores, tiles e sem erro de worker no console", async ({ page }) => {
    // Regressão: o MapLibre procurava o worker em /_next/static/chunks/ (404) e logava
    // "Worker failed to load". O mapa até aparecia (tiles raster usam a thread principal),
    // mas qualquer recurso que dependa do worker ficaria quebrado.
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text().slice(0, 160));
    });
    page.on("pageerror", (error) => problems.push(error.message.slice(0, 160)));
    const workerResponses: number[] = [];
    page.on("response", (response) => {
      if (/maplibre-gl-worker/.test(response.url())) workerResponses.push(response.status());
    });

    await page.goto("/mercados");
    await expect(page.locator(".maplibregl-canvas")).toBeVisible();
    await expect(page.locator(".maplibregl-marker")).toHaveCount(6);
    await expect.poll(() => workerResponses.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(workerResponses.every((status) => status === 200)).toBe(true);
    expect(problems).toEqual([]);
  });
});

test.describe("geolocalização", () => {
  test("com permissão: ordena os mercados por distância, crescente", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(CAXIAS);
    await page.goto("/mercados");
    await page.getByRole("button", { name: "Ordenar por distância" }).click();
    await expect(page.getByRole("button", { name: "Atualizar minha posição" })).toBeVisible();

    const distances = await page.locator("main ul li span.tabular-nums").evaluateAll((spans) =>
      spans.map((span) => {
        const [, value = "0", unit] =
          (span.textContent ?? "").match(/(\d+(?:[.,]\d+)?)\s?(km|m)\b/) ?? [];
        return Number.parseFloat(value.replace(",", ".")) * (unit === "km" ? 1000 : 1);
      }),
    );
    expect(distances.length).toBe(6);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  test("sem permissão: avisa com clareza e a lista de mercados continua", async ({ page }) => {
    await page.goto("/mercados");
    await page.getByRole("button", { name: "Ordenar por distância" }).click();
    await expect(page.getByRole("status")).toContainText("Não conseguimos sua localização");
    await expect(page.locator("main ul li")).toHaveCount(6);
  });

  test("na lista: 'Considerar distância' mantém o total e não guarda a posição", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(CAXIAS);
    await addFirstResultToList(page, "arroz");
    await addFirstResultToList(page, "leite");
    await page.goto("/lista");
    await expect(page.getByText("melhor mercado único")).toBeVisible();

    await page.getByRole("button", { name: "Considerar distância" }).click();
    await expect(page.getByRole("button", { name: "Posição ativa" })).toBeVisible();
    await expect(page.getByText("melhor mercado único")).toBeVisible();

    // Privacidade (promessa da tela): nada de coordenadas em armazenamento do navegador.
    const stored = await page.evaluate(
      () =>
        JSON.stringify({ ...localStorage }) +
        JSON.stringify({ ...sessionStorage }) +
        document.cookie,
    );
    expect(stored).not.toMatch(/-29\.1|-51\.1|latitude|longitude/);
  });

  test("na lista, sem permissão: mensagem amigável e comparação segue funcionando", async ({
    page,
  }) => {
    await addFirstResultToList(page, "arroz");
    await page.goto("/lista");
    await page.getByRole("button", { name: "Considerar distância" }).click();
    await expect(page.getByText(/Não conseguimos sua localização/)).toBeVisible({
      timeout: 15_000,
    }); // getCurrentPosition espera até 8 s pelo prompt
    await expect(page.getByText("melhor mercado único")).toBeVisible();
  });
});

test.describe("compartilhar no WhatsApp", () => {
  test("o link leva o resumo certo, codificado, e abre fora do app com rel seguro", async ({
    page,
  }) => {
    await addFirstResultToList(page, "arroz");
    await addFirstResultToList(page, "leite");
    await page.goto("/lista");
    const share = page.getByRole("link", { name: /Compartilhar no WhatsApp/ });
    await expect(share).toBeVisible();

    const href = (await share.getAttribute("href")) ?? "";
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    expect(await share.getAttribute("target")).toBe("_blank");
    expect(await share.getAttribute("rel")).toContain("noopener");

    const text = decodeURIComponent(href.slice("https://wa.me/?text=".length));
    expect(text).toMatch(/^Minha lista sai por R\$\s?\d/);
    expect(text).toContain("Arroz");
    expect(text).toContain("Leite integral");
    // Nada de dados internos ou pessoais no texto compartilhado.
    expect(text).not.toMatch(/uuid|productId|token|@|localhost/i);
    expect(href.length).toBeLessThan(2000);
  });
});

test.describe("PWA e offline", () => {
  test("service worker registra, guarda a lista visitada e responde offline", async ({
    page,
    context,
  }) => {
    await addFirstResultToList(page, "arroz");
    await page.goto("/lista");
    await expect(page.getByText("melhor mercado único")).toBeVisible();

    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    // O SW só controla a página depois de um reload quando já existia uma visita.
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: /Itens \(1\)/ })).toBeVisible();
    await context.setOffline(false);
  });

  test("não guarda páginas sensíveis nem respostas de API nos caches", async ({ page }) => {
    await page.goto("/conta");
    await page.goto("/admin"); // redireciona para /conta para visitante
    await page.goto("/lista");
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();

    const cachedPaths = await page.evaluate(async () => {
      const paths: string[] = [];
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys()) {
          paths.push(new URL(request.url).pathname);
        }
      }
      return paths;
    });
    expect(cachedPaths.some((path) => /^\/(admin|auth|conta|api)/.test(path))).toBe(false);
    expect(cachedPaths).toContain("/lista");
  });

  test("offline: avisa em vez de travar no carregamento e recupera ao reconectar", async ({
    page,
    context,
  }) => {
    await addFirstResultToList(page, "leite");
    await page.goto("/lista");
    await expect(page.getByText("melhor mercado único")).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);

    await context.setOffline(true);
    // Muda a quantidade: dispara nova comparação, que precisa do servidor.
    await page.getByRole("button", { name: /Aumentar quantidade/ }).click();
    await expect(page.getByRole("heading", { name: /Itens \(1\)/ })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Sem conexão" })).toBeVisible({
      timeout: 15_000,
    });

    // Reconectou: compara sozinho, sem o usuário mexer na lista.
    await context.setOffline(false);
    await expect(page.getByText("melhor mercado único")).toBeVisible({ timeout: 15_000 });
  });

  test("manifest é instalável: ícones respondem 200 como PNG", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.display).toBe("standalone");
    for (const icon of manifest.icons as { src: string; type: string }[]) {
      const response = await request.get(icon.src);
      expect(response.status(), icon.src).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/png");
    }
  });
});

test.describe("telas pequenas", () => {
  const pages = ["/", "/busca?q=leite", "/ofertas", "/lista", "/mercados", "/conta"];
  for (const width of [320, 360, 390, 430]) {
    test(`sem rolagem horizontal em ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const overflowing: string[] = [];
      for (const path of pages) {
        await page.goto(path);
        await page.waitForLoadState("load");
        await page.waitForTimeout(400);
        const { scrollWidth, innerWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        if (scrollWidth > innerWidth) overflowing.push(`${path}: ${scrollWidth} > ${innerWidth}`);
      }
      expect(overflowing).toEqual([]);
    });
  }

  test("alvos de toque principais têm pelo menos 44px de altura no celular", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Zoom do MapLibre só cresce com ponteiro grosso (celular real).");
    await page.setViewportSize({ width: 390, height: 844 });
    const tooSmall: string[] = [];
    for (const path of ["/", "/lista", "/mercados", "/conta"]) {
      await page.goto(path);
      // Sem isto o mapa pode ainda não ter montado e o teste passaria por sorte.
      if (path === "/mercados")
        await expect(page.locator(".maplibregl-ctrl-zoom-in")).toBeVisible();
      await page.waitForTimeout(500);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("main a, main button, nav a, main input")]
          .filter((element) => {
            const box = element.getBoundingClientRect();
            return box.width > 1 && box.height > 1 && box.height < 40;
          })
          .map(
            (element) =>
              `${(element.innerText || element.getAttribute("aria-label") || element.tagName).slice(0, 24)} ${Math.round(element.getBoundingClientRect().height)}px`,
          ),
      );
      tooSmall.push(...small.map((entry) => `${path}: ${entry}`));
    }
    expect(tooSmall).toEqual([]);
  });
});
