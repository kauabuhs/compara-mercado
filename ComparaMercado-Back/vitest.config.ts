import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Os testes de integração compartilham um único banco: um arquivo cria mercados e preços
    // enquanto outro compara ou conta, e o resultado variava entre execuções. Um arquivo por vez.
    fileParallelism: false,
    // Os testes de integração criam dados no Supabase local em `beforeAll`; com vários arquivos
    // em paralelo contra o mesmo banco o padrão de 10 s estoura sem que haja falha real.
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
