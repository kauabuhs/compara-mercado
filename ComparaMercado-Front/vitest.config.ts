import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mesmos aliases do tsconfig, para testar módulos que importam por `@/` e `@contracts`.
  resolve: {
    alias: {
      "@contracts": fileURLToPath(
        new URL("../ComparaMercado-Back/src/contracts/index.ts", import.meta.url),
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
