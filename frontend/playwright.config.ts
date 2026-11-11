import { defineConfig, devices } from "@playwright/test";

// Variáveis públicas do front para os testes (o Next as lê sozinho; o Playwright não).
try {
  process.loadEnvFile(".env.local");
} catch {
  // sem .env.local: os testes que dependem do Supabase local são ignorados
}

const PORT = Number(process.env["E2E_PORT"] ?? 3100);
const API_PORT = Number(process.env["E2E_API_PORT"] ?? 4100);

// Roda contra o build de produção do front, a API do back-end e o Supabase local com seed
// (pnpm db:start). A API lê SUPABASE_URL/SUPABASE_ANON_KEY do ambiente ou de backend/apps/api/.env.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "on-first-retry", locale: "pt-BR" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      // `node` direto (sem o wrapper do pnpm): assim o Playwright encerra a API ao terminar.
      command:
        "node --env-file-if-exists=../backend/apps/api/.env ../backend/apps/api/dist/main.js",
      url: `http://127.0.0.1:${API_PORT}/healthz`,
      reuseExistingServer: !process.env["CI"],
      timeout: 60_000,
      env: { ...(process.env as Record<string, string>), API_PORT: String(API_PORT) },
    },
    {
      command: `pnpm exec next start -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env["CI"],
      timeout: 60_000,
      env: {
        ...(process.env as Record<string, string>),
        API_URL: `http://127.0.0.1:${API_PORT}`,
      },
    },
  ],
});
