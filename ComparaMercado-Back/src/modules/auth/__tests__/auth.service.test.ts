import { describe, expect, it, vi } from "vitest";
import { DbError } from "../../../database/errors";
import type { Db } from "../../../database/supabase";
import { createAuthenticator } from "../service/auth.service";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.test" };
const CONFIG = { supabaseUrl: "http://supabase.test", supabaseAnonKey: "anon" };

/** Só o trecho do cliente que o autenticador usa: `auth.getUser`. */
function publicDbReturning(result: { data: { user: typeof USER | null }; error: unknown }): Db {
  return { auth: { getUser: vi.fn(async () => result) } } as unknown as Db;
}

/** Cliente do usuário que responde à leitura de `profiles` (`from().select().eq().maybeSingle()`). */
function userDbReturning(result: { data: unknown; error: unknown }): Db {
  const query = { maybeSingle: vi.fn(async () => result) };
  const chain = { select: () => ({ eq: () => query }) };
  return { from: vi.fn(() => chain) } as unknown as Db;
}

describe("createAuthenticator", () => {
  it("devolve o usuário com o papel lido de profiles", async () => {
    const authenticator = createAuthenticator(
      CONFIG,
      publicDbReturning({ data: { user: USER }, error: null }),
      () => userDbReturning({ data: { role: "admin", display_name: "Admin" }, error: null }),
    );
    expect(await authenticator.authenticate("token")).toEqual({
      id: USER.id,
      email: USER.email,
      role: "admin",
      displayName: "Admin",
    });
  });

  it("sem linha em profiles (conta recém-criada) assume o papel mais baixo", async () => {
    const authenticator = createAuthenticator(
      CONFIG,
      publicDbReturning({ data: { user: USER }, error: null }),
      () => userDbReturning({ data: null, error: null }),
    );
    expect(await authenticator.authenticate("token")).toMatchObject({
      role: "user",
      displayName: null,
    });
  });

  it("token recusado pelo Supabase vira null (401), sem consultar profiles", async () => {
    const userDbFor = vi.fn();
    const authenticator = createAuthenticator(
      CONFIG,
      publicDbReturning({
        data: { user: null },
        error: { name: "AuthApiError", status: 401, message: "invalid JWT" },
      }),
      userDbFor,
    );
    expect(await authenticator.authenticate("token")).toBeNull();
    expect(userDbFor).not.toHaveBeenCalled();
  });

  it("falha ao ler profiles NÃO rebaixa para 'user': vira erro de dados (502)", async () => {
    const authenticator = createAuthenticator(
      CONFIG,
      publicDbReturning({ data: { user: USER }, error: null }),
      () => userDbReturning({ data: null, error: { message: "timeout", code: "57014" } }),
    );
    await expect(authenticator.authenticate("token")).rejects.toBeInstanceOf(DbError);
  });

  it("falha de rede ou 5xx do Supabase Auth NÃO vira 'token inválido'", async () => {
    const transientErrors = [
      { name: "AuthRetryableFetchError", status: 0, message: "fetch failed" },
      { name: "AuthApiError", status: 503, message: "unavailable" },
    ];
    for (const error of transientErrors) {
      const authenticator = createAuthenticator(
        CONFIG,
        publicDbReturning({ data: { user: null }, error }),
        () => userDbReturning({ data: null, error: null }),
      );
      await expect(authenticator.authenticate("token")).rejects.toBeInstanceOf(DbError);
    }
  });
});
