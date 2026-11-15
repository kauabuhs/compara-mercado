import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createConfirmedUser,
  type LocalUser,
  localUsersConfigFromEnv,
} from "../../../__tests__/support/local-users";
import { createApp } from "../../../app";
import { CitiesResponseSchema, ProfileSchema, SessionUserSchema } from "../../../contracts";
import { createLogger } from "../../../lib/logger";
import { createSupabaseServices } from "../../../services";

// Roda contra o Supabase LOCAL (`pnpm db:start`) com RLS real. Ignorado sem as variáveis:
//   SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY e a chave admin local (ver `local-users.ts`)
// Cria um usuário descartável (já confirmado) por execução; nunca aponte para staging/produção.
const supabaseUrl = process.env["SUPABASE_TEST_URL"];
const anonKey = process.env["SUPABASE_TEST_ANON_KEY"];
const usersConfig = localUsersConfigFromEnv();

describe.skipIf(!supabaseUrl || !anonKey || !usersConfig)(
  "perfil da conta contra o Supabase local",
  { timeout: 30_000 },
  () => {
    const url = String(supabaseUrl);
    const key = String(anonKey);
    let app: ReturnType<typeof createApp>;
    let user: LocalUser;

    const call = (path: string, init: RequestInit = {}, token: string | null = user.accessToken) =>
      app.request(path, {
        ...init,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
      });
    const patch = (body: unknown) =>
      call("/v1/me/profile", { method: "PATCH", body: JSON.stringify(body) });

    beforeAll(async () => {
      app = createApp({
        services: createSupabaseServices({ supabaseUrl: url, supabaseAnonKey: key }),
        logger: createLogger("silent", "api"),
      });
      user = await createConfirmedUser(
        usersConfig ?? { url, anonKey: key, serviceRoleKey: "" },
        "perfil",
        { display_name: "  Maria Souza ", terms_version: "2026-11", role: "admin" },
      );
    });

    it("exige login", async () => {
      expect((await call("/v1/me/profile", {}, null)).status).toBe(401);
    });

    it("o cadastro grava nome e aceite dos termos, e o papel metadado é ignorado", async () => {
      const response = await call("/v1/me/profile");
      expect(response.status).toBe(200);
      const profile = ProfileSchema.parse(await response.json());
      expect(profile.email).toBe(user.email);
      expect(profile.displayName).toBe("Maria Souza");
      expect(profile.termsVersion).toBe("2026-11");
      expect(profile.termsAcceptedAt).not.toBeNull();

      const me = SessionUserSchema.parse(await (await call("/v1/me")).json());
      expect(me.role).toBe("user");
    });

    it("edita nome e telefone (normalizado) e /v1/me já mostra o nome novo", async () => {
      // aquece o cache de /v1/me com o nome antigo
      await call("/v1/me");
      const response = await patch({ displayName: "Maria S.", phone: "(54) 99999-0000" });
      expect(response.status).toBe(200);
      const profile = ProfileSchema.parse(await response.json());
      expect(profile.displayName).toBe("Maria S.");
      expect(profile.phone).toBe("+5554999990000");

      const me = SessionUserSchema.parse(await (await call("/v1/me")).json());
      expect(me.displayName).toBe("Maria S.");
    });

    it("apaga o telefone com null", async () => {
      const response = await patch({ phone: null });
      expect(ProfileSchema.parse(await response.json()).phone).toBeNull();
    });

    it("recusa telefone inválido, campo de papel e corpo vazio", async () => {
      const invalidPhone = await patch({ phone: "abc" });
      expect(invalidPhone.status).toBe(400);
      expect(((await invalidPhone.json()) as { error: { code: string } }).error.code).toBe(
        "invalid_phone",
      );
      expect((await patch({ role: "admin" })).status).toBe(400);
      expect((await patch({})).status).toBe(400);
    });

    it("escolhe uma cidade habilitada e recusa uma inexistente", async () => {
      const { cities } = CitiesResponseSchema.parse(await (await call("/v1/cities")).json());
      const city = cities[0];
      if (!city) throw new Error("o seed deveria ter ao menos uma cidade habilitada");

      const ok = await patch({ cityId: city.id });
      expect(ProfileSchema.parse(await ok.json()).cityId).toBe(city.id);

      const unknown = await patch({ cityId: "00000000-0000-4000-8000-000000000000" });
      expect(unknown.status).toBe(400);
      expect(((await unknown.json()) as { error: { code: string } }).error.code).toBe(
        "invalid_city",
      );
    });

    it("o banco barra papel e aceite dos termos mesmo fora da API", async () => {
      const direct = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${user.accessToken}` } },
      });
      const role = await direct.from("profiles").update({ role: "admin" }).eq("id", user.id);
      expect(role.error?.code).toBe("42501");
      const terms = await direct
        .from("profiles")
        .update({ terms_version: "2099-01" })
        .eq("id", user.id);
      expect(terms.error?.code).toBe("42501");
    });
  },
);
