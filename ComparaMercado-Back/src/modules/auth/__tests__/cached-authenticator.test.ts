import { describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../../../contracts";
import type { Authenticator } from "../auth.types";
import { withAuthCache } from "../service/cached-authenticator";

const admin: SessionUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "admin@example.com",
  role: "admin",
  displayName: null,
};

function buildInner(users: Partial<Record<string, SessionUser>>) {
  const authenticate = vi.fn(async (token: string) => users[token] ?? null);
  const inner: Authenticator = { authenticate };
  return { inner, authenticate };
}

describe("withAuthCache", () => {
  it("valida uma vez e reaproveita dentro do TTL", async () => {
    const clock = { now: 0 };
    const { inner, authenticate } = buildInner({ good: admin });
    const cached = withAuthCache(inner, { ttlMs: 30_000, now: () => clock.now });

    expect(await cached.authenticate("good")).toEqual(admin);
    clock.now = 29_999;
    expect(await cached.authenticate("good")).toEqual(admin);
    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  it("revalida depois do TTL (papel e revogação voltam a valer)", async () => {
    const clock = { now: 0 };
    const users: { good?: SessionUser } = { good: admin };
    const { inner, authenticate } = buildInner(users);
    const cached = withAuthCache(inner, { ttlMs: 30_000, now: () => clock.now });

    await cached.authenticate("good");
    delete users.good;
    clock.now = 30_001;

    expect(await cached.authenticate("good")).toBeNull();
    expect(authenticate).toHaveBeenCalledTimes(2);
  });

  it("não lembra token inválido", async () => {
    const { inner, authenticate } = buildInner({});
    const cached = withAuthCache(inner, { now: () => 0 });

    expect(await cached.authenticate("bad")).toBeNull();
    expect(await cached.authenticate("bad")).toBeNull();
    expect(authenticate).toHaveBeenCalledTimes(2);
  });

  it("chamadas simultâneas com o mesmo token compartilham uma validação", async () => {
    const { inner, authenticate } = buildInner({ good: admin });
    const cached = withAuthCache(inner, { now: () => 0 });

    const results = await Promise.all([
      cached.authenticate("good"),
      cached.authenticate("good"),
      cached.authenticate("good"),
    ]);

    expect(results).toEqual([admin, admin, admin]);
    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  it("tokens diferentes não se misturam", async () => {
    const other: SessionUser = {
      ...admin,
      id: "22222222-2222-4222-8222-222222222222",
      role: "user",
    };
    const { inner } = buildInner({ a: admin, b: other });
    const cached = withAuthCache(inner, { now: () => 0 });

    expect((await cached.authenticate("a"))?.role).toBe("admin");
    expect((await cached.authenticate("b"))?.role).toBe("user");
  });

  it("falha do provedor não fica guardada", async () => {
    const authenticate = vi
      .fn<Authenticator["authenticate"]>()
      .mockRejectedValueOnce(new Error("supabase fora"))
      .mockResolvedValueOnce(admin);
    const cached = withAuthCache({ authenticate }, { now: () => 0 });

    await expect(cached.authenticate("good")).rejects.toThrow("supabase fora");
    expect(await cached.authenticate("good")).toEqual(admin);
  });
});
