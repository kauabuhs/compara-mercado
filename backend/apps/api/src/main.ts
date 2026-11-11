import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadEnv } from "./env";
import { createLogger } from "./logger";
import { createSupabaseServices } from "./services/supabase-services";

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);

const app = createApp({
  services: createSupabaseServices({
    supabaseUrl: env.SUPABASE_URL,
    supabaseAnonKey: env.SUPABASE_ANON_KEY,
  }),
  logger,
});

const server = serve({ fetch: app.fetch, port: env.API_PORT, hostname: env.API_HOST }, (info) =>
  logger.info({ host: info.address, port: info.port }, "api no ar"),
);

function shutdown(signal: string) {
  logger.info({ signal }, "encerrando a api");
  server.close((error) => {
    if (error) logger.error({ err: error }, "erro ao encerrar");
    process.exit(error ? 1 : 0);
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
