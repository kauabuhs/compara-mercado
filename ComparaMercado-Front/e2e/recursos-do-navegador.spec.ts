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
    const storeRows = page.locator("main ul li:visible");
    await expect(storeRows.first()).toBeVisible();
    const storeCount = await storeRows.count();
    expect(storeCount).toBeGreaterThanOrEqual(6);
    await expect(page.locator(".maplibregl-marker")).toHaveCount(storeCount);
    await expect.poll(() => workerResponses.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(workerResponses.every((status) => status === 200)).toBe(true);
    expect(problems).toEqual([]);
  });
});

test.describe("mapa: uso com mouse (desktop)", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, "No celular o mapa é por toque (sem mouse nem botões de zoom).");
  });

  /** Distância entre os dois primeiros pinos: cresce ao aproximar, encolhe ao afastar. */
  async function pinSpacing(page: Page) {
    const [first, second] = await page.locator(".maplibregl-marker").all();
    const a = await first?.boundingBox();
    const b = await second?.boundingBox();
    return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
  }

  async function openMap(page: Page) {
    await page.goto("/mercados");
    await expect(page.locator(".maplibregl-marker").first()).toBeVisible();
    // espera o mapa ficar pronto (a camada de carregamento some quando o estilo chega)
    await expect(page.locator(".animate-pulse.absolute")).toHaveCount(0, { timeout: 20_000 });
  }

  test("tem botões de zoom e eles funcionam com o mouse", async ({ page }) => {
    await openMap(page);
    const before = await pinSpacing(page);
    await page.getByRole("button", { name: "Aproximar" }).click();
    await expect.poll(() => pinSpacing(page)).toBeGreaterThan(before);
    await page.getByRole("button", { name: "Afastar" }).click();
    await page.getByRole("button", { name: "Afastar" }).click();
    await expect.poll(() => pinSpacing(page)).toBeLessThan(before);
  });

  test("a roda do mouse aproxima e arrastar move o mapa (sem exigir Ctrl)", async ({ page }) => {
    await openMap(page);
    const map = page.getByLabel("Mapa dos mercados");
    const box = await map.boundingBox();
    const center = {
      x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
      y: (box?.y ?? 0) + (box?.height ?? 0) / 2,
    };
    // Ponto de arrasto fora dos pinos e dos controles (um pino no meio "roubaria" o clique).
    const empty = {
      x: (box?.x ?? 0) + (box?.width ?? 0) * 0.08,
      y: (box?.y ?? 0) + (box?.height ?? 0) * 0.5,
    };

    const spacing = await pinSpacing(page);
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, -400);
    await expect.poll(() => pinSpacing(page)).toBeGreaterThan(spacing);

    const pin = page.locator(".maplibregl-marker").first();
    const pinBefore = await pin.boundingBox();
    await page.mouse.move(empty.x, empty.y);
    await page.mouse.down();
    await page.mouse.move(empty.x + 120, empty.y + 60, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => ((await pin.boundingBox())?.x ?? 0) - (pinBefore?.x ?? 0))
      .toBeGreaterThan(60);
  });
});

test.describe("mapa: tela cheia", () => {
  test("entra em tela cheia e sai pelo botão", async ({ page }) => {
    // Pela API nativa onde o navegador deixa; senão, pelo modo alternativo (o headless recusa a
    // API). Nos dois o mapa passa a cobrir a janela e o botão troca de rótulo.
    await page.goto("/mercados");
    await page.getByRole("button", { name: "Tela cheia" }).click();
    await expect(page.getByRole("button", { name: "Sair da tela cheia" })).toBeVisible();
    await expect
      .poll(async () => (await page.getByLabel("Mapa dos mercados").boundingBox())?.width)
      .toBe(page.viewportSize()?.width);

    await page.getByRole("button", { name: "Sair da tela cheia" }).click();
    await expect(page.getByRole("button", { name: "Tela cheia" })).toBeVisible();
    // sair da tela cheia nativa leva um instante
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  });

  test("sem a Fullscreen API (iPhone) o mapa cobre a janela e o Esc sai", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, "fullscreenEnabled", { value: false });
    });
    await page.goto("/mercados");
    await page.getByRole("button", { name: "Tela cheia" }).click();
    await expect(page.getByRole("button", { name: "Sair da tela cheia" })).toBeVisible();

    const viewport = page.viewportSize();
    const box = await page.getByLabel("Mapa dos mercados").boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(viewport?.width);
    expect(Math.round(box?.height ?? 0)).toBe(viewport?.height);
    // a página de trás não rola enquanto o mapa cobre a janela
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Tela cheia" })).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  });

  test("'Mostrar todos os mercados' continua à mão, separado da tela cheia", async ({ page }) => {
    await page.goto("/mercados");
    await expect(page.getByRole("button", { name: "Mostrar todos os mercados" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tela cheia" })).toBeVisible();
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
    expect(distances.length).toBeGreaterThanOrEqual(6);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  test("sem permissão: avisa com clareza e a lista de mercados continua", async ({ page }) => {
    await page.goto("/mercados");
    await page.getByRole("button", { name: "Ordenar por distância" }).click();
    await expect(page.getByRole("status")).toContainText("Não conseguimos sua localização");
    await expect(page.locator("main ul li:visible").first()).toBeVisible();
    expect(await page.locator("main ul li:visible").count()).toBeGreaterThanOrEqual(6);
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
    await page.goto("/entrar");
    await page.goto("/cadastro");
    await page.goto("/comunidade");
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
    expect(
      cachedPaths.some((path) =>
        /^\/(admin|auth|conta|api|entrar|cadastro|recuperar-senha|nova-senha|comunidade)/.test(
          path,
        ),
      ),
    ).toBe(false);
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
  const pages = ["/", "/busca?q=leite", "/ofertas", "/comunidade", "/lista", "/mercados", "/conta"];
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
    test.skip(
      !isMobile,
      "Os controles do mapa só mudam de tamanho com ponteiro grosso (celular real).",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    const tooSmall: string[] = [];
    for (const path of ["/", "/lista", "/mercados", "/conta"]) {
      await page.goto(path);
      // Sem isto o mapa pode ainda não ter montado e o teste passaria por sorte.
      if (path === "/mercados")
        await expect(page.getByRole("button", { name: "Tela cheia" })).toBeVisible();
      await page.waitForTimeout(500);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("main a, main button, nav a, main input")]
          .filter((element) => {
            // Créditos do mapa (OpenStreetMap, OpenFreeMap…): atribuição exigida pela licença, de
            // terceiros e pequena por design; não é um controle do app.
            if (element.closest(".maplibregl-ctrl-attrib")) return false;
            const box = element.getBoundingClientRect();
            return box.width > 1 && box.height > 1 && box.height < 40;
          })
          .map(
            (element) =>
              `${(element.textContent?.trim() || element.getAttribute("aria-label") || element.tagName).slice(0, 24)} ${Math.round(element.getBoundingClientRect().height)}px`,
          ),
      );
      tooSmall.push(...small.map((entry) => `${path}: ${entry}`));
    }
    expect(tooSmall).toEqual([]);
  });
});
