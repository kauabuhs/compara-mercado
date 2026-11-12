// Gera ComparaMercado-Back/src/database/database.types.ts a partir do banco LOCAL (supabase start).
// Uso: pnpm db:types   (rode após criar/alterar migrações e antes de commitar)
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const out = resolve(import.meta.dirname, "../ComparaMercado-Back/src/database/database.types.ts");
const sql = execSync(
  "pnpm exec supabase gen types typescript --schema public --workdir ComparaMercado-Back",
  {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  },
);
writeFileSync(out, sql);
console.log(`Tipos gravados em ${out}`);
