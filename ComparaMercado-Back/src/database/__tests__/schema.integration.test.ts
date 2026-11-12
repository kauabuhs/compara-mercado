/**
 * Garante que `schema.ts` (o modelo do ORM) e o banco real dizem a MESMA coisa, nos dois sentidos:
 *   1. tudo que o schema declara existe no banco (tabela, view e coluna);
 *   2. tudo que o banco tem no schema `public` está declarado no schema.
 * Se alguém criar uma migração e esquecer `pnpm db:schema`, este teste falha na CI.
 *
 * Rode com DATABASE_URL_TEST apontando para um banco com as migrações aplicadas.
 */
import { getTableName, getViewName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOrmDb, createPool, type OrmDb } from "../client";
import { tables, views } from "../schema";

const url = process.env["DATABASE_URL_TEST"];

describe.skipIf(!url)("schema.ts × banco real", () => {
  let pool: pg.Pool;
  let db: OrmDb;

  beforeAll(() => {
    pool = createPool(url as string, { max: 2, applicationName: "compara-schema-check" });
    db = createOrmDb(pool);
  });
  afterAll(async () => {
    await pool?.end();
  });

  it("toda tabela e view do schema pode ser consultada (as colunas declaradas existem)", async () => {
    for (const [name, table] of Object.entries(tables)) {
      await expect(db.select().from(table).limit(0), `tabela ${name}`).resolves.toEqual([]);
    }
    for (const [name, view] of Object.entries(views)) {
      await expect(db.select().from(view).limit(0), `view ${name}`).resolves.toEqual([]);
    }
  });

  it("toda tabela do banco está no schema, com exatamente as mesmas colunas", async () => {
    const { rows } = await pool.query<{ rel: string; cols: string[] }>(`
      select c.relname rel, array_agg(a.attname::text order by a.attnum) cols
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      where n.nspname = 'public' and c.relkind = 'r' and not c.relispartition
      group by c.relname order by c.relname`);

    const inSchema = new Map<string, string[]>(
      Object.values(tables).map((t) => [
        getTableName(t),
        getTableConfig(t).columns.map((c) => c.name),
      ]),
    );

    expect([...inSchema.keys()].sort(), "tabelas: schema × banco").toEqual(rows.map((r) => r.rel));
    for (const { rel, cols } of rows) {
      expect([...(inSchema.get(rel) ?? [])].sort(), `colunas de ${rel}`).toEqual([...cols].sort());
    }
  });

  it("toda view do banco está no schema", async () => {
    const { rows } = await pool.query<{ rel: string }>(`
      select c.relname rel from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('v', 'm') order by c.relname`);
    const declared = Object.values(views)
      .map((v) => getViewName(v))
      .sort();
    expect(declared).toEqual(rows.map((r) => r.rel));
  });
});
