import { expect, test } from "@playwright/test";
import { adminAccessToken, apiRequest } from "./support/api";
import {
  hasLocalSupabase,
  SUPABASE_URL,
  sessionCookies,
  signInAsAdmin,
  signUpNewUser,
} from "./support/session";

// Autorização do painel: visitante e usuário comum em TODAS as rotas /admin/*, nas rotas de foto
// e direto na API (401 sem token, 403 sem papel). O guarda do layout é a primeira barreira; o
// papel + RLS na API, a segunda. Só roda contra o Supabase LOCAL.

const ADMIN_PAGES = [
  "/admin",
  "/admin/precos",
  "/admin/revisao",
  "/admin/moderacao",
  "/admin/produtos",
  "/admin/mercados",
  "/admin/cidades",
  "/admin/categorias",
];

const ADMIN_API = [
  "/v1/admin/overview",
  "/v1/admin/price-form-options",
  "/v1/admin/review-queue",
  "/v1/admin/moderation",
  "/v1/admin/cities",
  "/v1/admin/stores",
  "/v1/admin/categories",
  "/v1/admin/products",
];

test.describe("admin: acesso", () => {
  test.skip(!hasLocalSupabase, "exige o Supabase local");

  test("visitante é levado a entrar, com volta ao painel, em todas as 8 telas", async ({
    page,
  }) => {
    for (const path of ADMIN_PAGES) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/entrar\?next=\/admin$/);
      await expect(page.getByRole("heading", { name: /Entrar/i }).first()).toBeVisible();
    }
  });

  test("usuário comum vê por que não passou, em todas as 8 telas, e não vê o painel na conta", async ({
    browser,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://localhost:3100";
    const context = await browser.newContext({ baseURL: origin });
    await context.addCookies(sessionCookies(await signUpNewUser("acesso"), origin));
    const page = await context.newPage();

    for (const path of ADMIN_PAGES) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/conta\?aviso=sem-permissao/);
    }
    await expect(page.getByRole("link", { name: "Painel interno" })).toHaveCount(0);
    await context.close();
  });

  test("a foto de um envio (rota do admin) não abre para visitante nem usuário comum", async ({
    browser,
    baseURL,
    request,
  }) => {
    const origin = baseURL ?? "http://localhost:3100";
    const anyId = "00000000-0000-4000-8000-000000000000";

    const visitor = await request.get(`/admin/foto/${anyId}`, { maxRedirects: 0 });
    expect([307, 308, 401, 403, 404]).toContain(visitor.status());

    const context = await browser.newContext({ baseURL: origin });
    await context.addCookies(sessionCookies(await signUpNewUser("acesso-foto"), origin));
    const common = await context.request.get(`/admin/foto/${anyId}`, { maxRedirects: 0 });
    expect([307, 308, 401, 403, 404]).toContain(common.status());
    await context.close();
  });

  test("na API: sem token = 401; usuário comum = 403; admin = 200", async () => {
    const userSession = (await signUpNewUser("acesso-api")) as { access_token: string };
    const adminToken = await adminAccessToken();
    for (const path of ADMIN_API) {
      const anonymous = await fetch(
        `http://127.0.0.1:${process.env["E2E_API_PORT"] ?? 4100}${path}`,
      );
      expect(anonymous.status, `${path} sem token`).toBe(401);
      expect(
        (await apiRequest(userSession.access_token, "GET", path)).status,
        `${path} usuário`,
      ).toBe(403);
      expect((await apiRequest(adminToken, "GET", path)).status, `${path} admin`).toBe(200);
    }
  });

  test("na API: usuário comum não consegue criar nem editar nada do cadastro-base", async () => {
    const userSession = (await signUpNewUser("acesso-escrita")) as { access_token: string };
    const token = userSession.access_token;
    const zero = "00000000-0000-4000-8000-000000000000";
    const attempts: Array<["POST" | "PATCH", string, unknown]> = [
      [
        "POST",
        "/v1/admin/prices",
        { storeId: zero, productId: zero, priceCents: 100, promo: false },
      ],
      ["POST", "/v1/admin/cities", { name: "Invasora", uf: "RS", ibgeCode: "9999999" }],
      ["POST", "/v1/admin/categories", { name: "Invasora", slug: "invasora" }],
      ["PATCH", `/v1/admin/products/${zero}`, { status: "archived" }],
      ["PATCH", `/v1/admin/stores/${zero}`, { status: "inactive" }],
      ["POST", `/v1/admin/observations/${zero}/review`, { decision: "approved" }],
      ["POST", `/v1/admin/moderation/${zero}`, { action: "keep" }],
    ];
    for (const [method, path, body] of attempts) {
      const response = await apiRequest(token, method, path, body);
      expect(response.status, `${method} ${path}`).toBe(403);
    }
  });

  test("a chave de serviço nunca chega ao navegador (HTML e scripts da página inicial)", async ({
    page,
  }) => {
    const served: string[] = [];
    page.on("response", async (response) => {
      const type = response.headers()["content-type"] ?? "";
      if (type.includes("javascript") || type.includes("html")) {
        served.push(await response.text().catch(() => ""));
      }
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const serviceRole = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
    for (const body of served) {
      expect(body).not.toContain("service_role");
      if (serviceRole) expect(body).not.toContain(serviceRole);
    }
    // a chave pública pode aparecer (é feita para isso); o endereço do Supabase também
    expect(SUPABASE_URL).toBeTruthy();
  });

  test("o admin entra nas 8 telas sem ser redirecionado", async ({ context, baseURL, page }) => {
    await context.addCookies(
      sessionCookies(await signInAsAdmin(), baseURL ?? "http://localhost:3100"),
    );
    for (const path of ADMIN_PAGES) {
      await page.goto(path);
      await expect(page, path).toHaveURL(new RegExp(`${path}$`));
    }
  });
});
