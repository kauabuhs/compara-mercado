import { createServer } from "node:http";
import { PgBoss } from "pg-boss";
import { loadEnv } from "./config/worker-env";
import { type RegisteredJobs, registerJobs } from "./jobs";
import { createLogger } from "./lib/logger";

const env = loadEnv();
const log = createLogger(env.LOG_LEVEL, "worker");

const boss = new PgBoss({ connectionString: env.DATABASE_URL, application_name: "compara-worker" });
boss.on("error", (err) => log.error({ err }, "erro do pg-boss"));

let ready = false;
let jobs: RegisteredJobs | undefined;

// Sonda de saúde para o container (Railway/Fly): 200 só depois que a fila subiu.
const health = createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: ready ? "ok" : "starting" }));
    return;
  }
  res.writeHead(404).end();
});

async function main() {
  await boss.start();
  jobs = await registerJobs(boss, env, log);
  ready = true;
  health.listen(env.PORT, () => log.info({ port: env.PORT }, "worker no ar"));
}

async function shutdown(signal: string) {
  log.info({ signal }, "encerrando: aguardando jobs em andamento");
  ready = false;
  health.close();
  await boss.stop({ graceful: true, timeout: 30_000 });
  await jobs?.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

main().catch((err) => {
  log.fatal({ err }, "falha ao iniciar o worker");
  process.exit(1);
});
