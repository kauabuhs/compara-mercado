import { expect, test } from "@playwright/test";

// Caminho autenticado ponta a ponta: cookie de sessão -> Next -> API (valida o token e o papel)
// -> Postgres sob RLS. Só leitura. Usa o admin do seed LOCAL e nunca roda fora de localhost.
const SUPABASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const SUPABASE_ANON_KEY = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const ADMIN_EMAIL = process.env["E2E_ADMIN_EMAIL"] ?? "admin@local.test";
const ADMIN_PASSWORD = process.env["E2E_ADMIN_PASSWORD"] ?? "admin123456";

const isLocalSupabase = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(SUPABASE_URL ?? "");
const SESSION_COOKIE_CHUNK_SIZE = 3180;

async function signInAsAdmin(): Promise<unknown> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY ?? "", "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!response.ok) throw new Error(`login do admin local falhou (${response.status})`);
  return response.json();
}

/** Cookies de sessão no formato do @supabase/ssr: valor base64url dividido em pedaços. */
function sessionCookies(session: unknown, baseURL: string) {
  const projectRef = new URL(SUPABASE_URL ?? "").hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const chunks: string[] = [];
  for (let start = 0; start < encoded.length; start += SESSION_COOKIE_CHUNK_SIZE) {
    chunks.push(encoded.slice(start, start + SESSION_COOKIE_CHUNK_SIZE));
  }
  const { hostname } = new URL(baseURL);
  const named =
    chunks.length === 1
      ? [[cookieName, chunks[0] ?? ""]]
      : chunks.map((chunk, index) => [`${cookieName}.${index}`, chunk]);
  return named.map(([name, value]) => ({
    name: name ?? "",
    value: value ?? "",
    domain: hostname,
    path: "/",
  }));
}

test.describe("admin autenticado", () => {
  test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY || !isLocalSupabase, "exige o Supabase local");

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
