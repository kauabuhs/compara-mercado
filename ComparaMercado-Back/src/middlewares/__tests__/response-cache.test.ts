import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { responseCache } from "../response-cache";

function buildApp(options: { ttlSeconds?: number; maxEntries?: number; clock: { now: number } }) {
  let calls = 0;
  const app = new Hono();
  app.use(
    "/data",
    responseCache({
      ttlSeconds: options.ttlSeconds ?? 60,
      ...(options.maxEntries ? { maxEntries: options.maxEntries } : {}),
      now: () => options.clock.now,
    }),
  );
  app.get("/data", (c) => {
    calls++;
    if (c.req.query("fail")) return c.json({ error: "x" }, 500);
    return c.json({ calls, q: c.req.query("q") ?? null });
  });
  app.post("/data", (c) => c.json({ posted: true }));
  return { app, callCount: () => calls };
}

describe("responseCache", () => {
  it("serve a segunda leitura do cache sem chamar o handler", async () => {
    const clock = { now: 1_000 };
    const { app, callCount } = buildApp({ clock });

    const first = await app.request("/data?q=a");
    expect(first.headers.get("x-cache")).toBe("MISS");
    const second = await app.request("/data?q=a");
    expect(second.headers.get("x-cache")).toBe("HIT");
    expect(await second.json()).toEqual(await first.json());
    expect(callCount()).toBe(1);
  });

  it("separa as entradas pela query string", async () => {
    const { app, callCount } = buildApp({ clock: { now: 0 } });
    await app.request("/data?q=a");
    await app.request("/data?q=b");
    expect(callCount()).toBe(2);
  });

  it("expira depois do TTL", async () => {
    const clock = { now: 0 };
    const { app, callCount } = buildApp({ ttlSeconds: 60, clock });
    await app.request("/data");
    clock.now = 59_000;
    expect((await app.request("/data")).headers.get("x-cache")).toBe("HIT");
    clock.now = 61_000;
    expect((await app.request("/data")).headers.get("x-cache")).toBe("MISS");
    expect(callCount()).toBe(2);
  });

  it("não guarda respostas de erro", async () => {
    const { app, callCount } = buildApp({ clock: { now: 0 } });
    expect((await app.request("/data?fail=1")).status).toBe(500);
    expect((await app.request("/data?fail=1")).status).toBe(500);
    expect(callCount()).toBe(2);
  });

  it("não interfere em métodos que não são GET", async () => {
    const { app } = buildApp({ clock: { now: 0 } });
    const response = await app.request("/data", { method: "POST" });
    expect(await response.json()).toEqual({ posted: true });
    expect(response.headers.get("x-cache")).toBeNull();
  });

  it("trata a mesma query em outra ordem como a mesma leitura", async () => {
    const { app, callCount } = buildApp({ clock: { now: 0 } });
    await app.request("/data?q=a&limit=5");
    const second = await app.request("/data?limit=5&q=a");
    expect(second.headers.get("x-cache")).toBe("HIT");
    expect(callCount()).toBe(1);
  });

  it("junta leituras idênticas simultâneas numa só ida ao handler", async () => {
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const app = new Hono();
    app.use("/slow", responseCache({ ttlSeconds: 60, now: () => 0 }));
    app.get("/slow", async (c) => {
      calls++;
      await gate;
      return c.json({ ok: true });
    });

    const pending = Promise.all([1, 2, 3].map(() => app.request("/slow")));
    // dá tempo de as três entrarem no middleware antes de liberar o handler
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    const responses = await pending;

    expect(calls).toBe(1);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(await Promise.all(responses.map((response) => response.json()))).toEqual([
      { ok: true },
      { ok: true },
      { ok: true },
    ]);
  });

  it("não compartilha erro: quem esperava tenta por conta própria", async () => {
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const app = new Hono();
    app.use("/flaky", responseCache({ ttlSeconds: 60, now: () => 0 }));
    app.get("/flaky", async (c) => {
      calls++;
      if (calls === 1) {
        await gate;
        return c.json({ error: "x" }, 500);
      }
      return c.json({ ok: true });
    });

    const first = app.request("/flaky");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = app.request("/flaky");
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();

    expect((await first).status).toBe(500);
    expect((await second).status).toBe(200);
    expect(calls).toBe(2);
  });

  it("descarta a entrada mais antiga ao passar do teto", async () => {
    const { app, callCount } = buildApp({ maxEntries: 2, clock: { now: 0 } });
    await app.request("/data?q=1");
    await app.request("/data?q=2");
    await app.request("/data?q=3"); // expulsa q=1
    expect(callCount()).toBe(3);
    await app.request("/data?q=3");
    await app.request("/data?q=2");
    expect(callCount()).toBe(3);
    await app.request("/data?q=1");
    expect(callCount()).toBe(4);
  });
});
