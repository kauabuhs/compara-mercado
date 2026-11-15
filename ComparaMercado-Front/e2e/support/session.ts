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

// ── E-mails do Supabase local (Mailpit) ─────────────────────────────────────────────────────────
// O cadastro exige confirmar o e-mail e a recuperação de senha chega por e-mail: os testes leem a
// caixa do Mailpit local, como uma pessoa leria a dela.
const MAILPIT_URL = process.env["E2E_MAILPIT_URL"] ?? "http://127.0.0.1:54324";

interface MailpitMessage {
  ID: string;
  Subject: string;
}

/** Primeiro link (`href`) do HTML do e-mail, já sem o escape de `&amp;`. */
function firstLink(html: string): string {
  const href = /href="([^"]+)"/.exec(html)?.[1];
  if (!href) throw new Error("o e-mail não tem nenhum link");
  return href.replaceAll("&amp;", "&");
}

/** Espera chegar um e-mail para `to` cujo assunto contém `subject` e devolve o link dele. */
export async function waitForEmailLink(to: string, subject: string): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const search = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
    );
    if (search.ok) {
      const { messages } = (await search.json()) as { messages: MailpitMessage[] };
      // O mais recente primeiro: a caixa é compartilhada entre execuções.
      const match = messages.find((message) => message.Subject.includes(subject));
      if (match) {
        const full = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`)).json()) as {
          HTML: string;
        };
        return firstLink(full.HTML);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`nenhum e-mail "${subject}" chegou para ${to}`);
}

/** Dados de um usuário comum descartável (a senha atende à política do Supabase local). */
export function newTestCredentials(label: string) {
  const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return { email: `e2e-${label}-${unique}@test.local`, password: `Senha-${unique}-Forte!` };
}

/**
 * Cria um usuário comum descartável e o deixa pronto para uso: cadastra, confirma o e-mail pelo
 * link recebido (como uma pessoa faria) e devolve a sessão.
 */
export async function signUpNewUser(label: string): Promise<unknown> {
  const { email, password } = newTestCredentials(label);
  await authRequest("signup", { email, password });
  const confirmLink = await waitForEmailLink(email, "Confirme seu e-mail");
  // O GET no link confirma o e-mail; o redirecionamento seguinte (para o site) não interessa.
  await fetch(confirmLink, { redirect: "manual" });
  return authRequest("token?grant_type=password", { email, password });
}

/** Mesmo que `signUpNewUser`, mas devolve também as credenciais (para entrar pela interface). */
export async function createConfirmedUser(label: string) {
  const credentials = newTestCredentials(label);
  await authRequest("signup", credentials);
  await fetch(await waitForEmailLink(credentials.email, "Confirme seu e-mail"), {
    redirect: "manual",
  });
  return credentials;
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
