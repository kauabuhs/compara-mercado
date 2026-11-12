// Sessão autenticada para os testes e2e: obtém o token direto do Supabase Auth LOCAL e o entrega
// ao navegador no formato de cookie do @supabase/ssr. Nunca rode isto fora de localhost.
export const SUPABASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"];
export const SUPABASE_ANON_KEY = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
export const ADMIN_EMAIL = process.env["E2E_ADMIN_EMAIL"] ?? "admin@local.test";
export const ADMIN_PASSWORD = process.env["E2E_ADMIN_PASSWORD"] ?? "admin123456";

export const isLocalSupabase = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(
  SUPABASE_URL ?? "",
);
export const hasLocalSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && isLocalSupabase);

const SESSION_COOKIE_CHUNK_SIZE = 3180;

async function authRequest(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY ?? "", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Supabase Auth local recusou ${path} (${response.status})`);
  return response.json();
}

export function signInAsAdmin(): Promise<unknown> {
  return authRequest("token?grant_type=password", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
}

/** Cria um usuário comum descartável (o Supabase local não exige confirmação de e-mail). */
export function signUpNewUser(label: string): Promise<unknown> {
  const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return authRequest("signup", {
    email: `e2e-${label}-${unique}@test.local`,
    password: `Senha-${unique}-Forte!`,
  });
}

/** Cookies de sessão no formato do @supabase/ssr: valor base64url dividido em pedaços. */
export function sessionCookies(session: unknown, baseURL: string) {
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
