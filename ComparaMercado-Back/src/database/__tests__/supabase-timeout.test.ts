import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createAnonClient } from "../supabase";

let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

/** Sobe um servidor que aceita a conexão e nunca responde: o gateway do Supabase "travado". */
async function startHangingServer(): Promise<string> {
  const hanging = createServer(() => {
    // propositalmente sem resposta
  });
  server = hanging;
  await new Promise<void>((resolve) => hanging.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(hanging.address() as AddressInfo).port}`;
}

describe("clientes do Supabase", () => {
  it("falham rápido, com erro (não exceção), quando o gateway não responde", async () => {
    const url = await startHangingServer();
    const db = createAnonClient(url, "x".repeat(40), { timeoutMs: 150 });

    const startedAt = performance.now();
    const { data, error } = await db.from("stores").select("id").limit(1);
    const elapsedMs = performance.now() - startedAt;

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(elapsedMs).toBeLessThan(2_000);
  });
});
