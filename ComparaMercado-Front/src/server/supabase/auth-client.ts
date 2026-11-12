import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "../env";

/**
 * Cliente do Supabase Auth ligado aos cookies do navegador, usado SÓ para a sessão
 * (entrar com link mágico, sair, trocar o código do link, ler o token de acesso).
 *
 * Usa a chave pública (anon). Nenhuma consulta a tabelas passa por aqui: os dados vêm da API do
 * back-end, que valida o token e aplica as regras. O fluxo PKCE do login exige que o mesmo
 * servidor que iniciou o link também troque o código, por isso a sessão fica no Next.
 */
export async function createAuthClient() {
  const cookieStore = await cookies();
  const environment = env();
  return createServerClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              // O navegador nunca usa o Supabase direto (ADR-0005): só o servidor do Next lê estes
              // cookies. httpOnly impede que um XSS roube o token; o padrão do @supabase/ssr é false.
              cookieStore.set(name, value, {
                ...options,
                httpOnly: true,
                sameSite: "lax",
                secure: process.env["NODE_ENV"] === "production",
              });
            }
          } catch {
            // Chamado de um Server Component (somente leitura): a sessão é renovada na próxima ação.
          }
        },
      },
    },
  );
}
