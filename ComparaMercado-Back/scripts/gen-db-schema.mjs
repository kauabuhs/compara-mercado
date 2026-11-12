// Gera src/database/schema.ts (Drizzle) a partir do banco LOCAL: TODAS as tabelas, views e colunas
// do schema `public`. É o equivalente do `schema.prisma` do ProAgendaV2: um arquivo para ler o modelo.
//
// Uso:  pnpm db:schema          (banco local: supabase start)
// Outro banco: defina DATABASE_URL antes de rodar.
//
// O banco é a fonte da verdade (migrações SQL em supabase/migrations). Este arquivo é GERADO:
// não edite à mão; mude a migração, aplique-a e rode `pnpm db:schema`.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

// Sem DATABASE_URL, pergunta ao Supabase CLI qual é o banco local (nenhuma credencial no código).
function localDatabaseUrl() {
  const env = execSync("pnpm exec supabase status -o env --workdir .", {
    encoding: "utf8",
    cwd: resolve(import.meta.dirname, ".."),
  });
  const line = env.split(/\r?\n/).find((l) => l.startsWith("DB_URL="));
  if (!line) throw new Error("Não achei DB_URL: o Supabase local está de pé? (pnpm db:start)");
  return line.slice("DB_URL=".length).replace(/^"|"$/g, "");
}
const url = process.env.DATABASE_URL ?? localDatabaseUrl();
const out = resolve(import.meta.dirname, "../src/database/schema.ts");

// Ordem e títulos das seções. Tabela que não esteja aqui cai em "Outras" (nada fica de fora).
const SECTIONS = [
  ["Geografia e mercados", ["currencies", "countries", "regions", "markets", "cities", "stores"]],
  [
    "Catálogo: marcas, famílias (identidade) e variantes",
    [
      "categories",
      "brands",
      "product_families",
      "products",
      "product_identifiers",
      "attribute_definitions",
      "family_attribute_values",
      "allergens",
      "family_allergens",
      "family_nutrition",
      "product_thumbnails",
    ],
  ],
  ["Preços publicados", ["price_lists", "product_prices"]],
  [
    "Promoções",
    ["promotions", "promotion_products", "promotion_rules", "promotion_scopes", "promotion_usage"],
  ],
  [
    "Estoque e fornecedores",
    [
      "suppliers",
      "supplier_products",
      "warehouses",
      "inventory",
      "inventory_movements",
      "stock_reservations",
    ],
  ],
  [
    "Mídias",
    ["media_assets", "media_renditions", "product_media", "brand_media", "category_media"],
  ],
  [
    "Comparador: observações de preço e ingestão",
    [
      "price_observations",
      "current_prices",
      "price_board",
      "product_aliases",
      "sources",
      "extractions",
      "review_tasks",
    ],
  ],
  [
    "Usuários, listas e contribuições",
    ["profiles", "shopping_lists", "list_items", "contributions"],
  ],
  ["Operação e auditoria", ["job_runs", "audit_log"]],
];

// Exceções documentadas (tabela.coluna -> trecho). O banco preenche por gatilho.
const OVERRIDES = {
  "products.family_id":
    ".default(sql`null`) /* NOT NULL no banco; o gatilho products_resolve_family preenche quando omitido */",
};

const camel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const q = (s) => JSON.stringify(s);

const client = new pg.Client({ connectionString: url });
await client.connect();

const enumsRes = await client.query(`
  select t.typname, array_agg(e.enumlabel::text order by e.enumsortorder) labels
  from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' group by t.typname order by t.typname`);
const enums = new Map(enumsRes.rows.map((r) => [r.typname, r.labels]));

const colsRes = await client.query(`
  select c.relname, c.relkind, a.attname, a.attnotnull, a.attgenerated, a.attidentity,
         format_type(a.atttypid, a.atttypmod) ftype, t.typname, t.typtype, t.typcategory,
         et.typname as elemname, pg_get_expr(d.adbin, d.adrelid) def
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  join pg_type t on t.oid = a.atttypid
  left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
  left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
  where n.nspname = 'public' and c.relkind in ('r','v','m') and c.relispartition = false
  order by c.relname, a.attnum`);

const consRes = await client.query(`
  select c.relname, k.contype, k.conname,
         (select array_agg(a.attname::text order by x.ord) from unnest(k.conkey) with ordinality x(attnum, ord)
            join pg_attribute a on a.attrelid = k.conrelid and a.attnum = x.attnum) cols,
         fc.relname fname,
         (select array_agg(a.attname::text order by x.ord) from unnest(k.confkey) with ordinality x(attnum, ord)
            join pg_attribute a on a.attrelid = k.confrelid and a.attnum = x.attnum) fcols
  from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
  left join pg_class fc on fc.oid = k.confrelid
  where n.nspname = 'public' and k.contype in ('p','f')`);
await client.end();

const objects = new Map();
for (const r of colsRes.rows) {
  if (!objects.has(r.relname))
    objects.set(r.relname, {
      kind: r.relkind,
      cols: [],
      pk: [],
      fks: new Map(),
      externalFks: [],
      compositeFks: [],
    });
  objects.get(r.relname).cols.push(r);
}
for (const k of consRes.rows) {
  const o = objects.get(k.relname);
  if (!o) continue;
  if (k.contype === "p") o.pk = k.cols;
  // FK para tabela de OUTRO schema (ex.: auth.users) não tem constante aqui: vira nota
  if (k.contype === "f" && k.cols.length === 1 && !objects.has(k.fname)) {
    o.externalFks.push(`${k.cols[0]} → ${k.fname}.${k.fcols[0]} (outro schema)`);
  } else if (k.contype === "f" && k.cols.length === 1) {
    o.fks.set(k.cols[0], { table: k.fname, col: k.fcols[0] });
  }
  if (k.contype === "f" && k.cols.length > 1) {
    o.compositeFks.push(`(${k.cols.join(", ")}) → ${k.fname}(${k.fcols.join(", ")})`);
  }
}

const usedImports = new Set(["pgTable"]);
function use(name) {
  usedImports.add(name);
  return name;
}
let needsSql = false;
let needsGeography = false;
let needsVector = false;

function builder(col, tableName) {
  const name = q(col.attname);
  const isArray = col.typcategory === "A";
  const base = isArray ? col.elemname : col.typname;
  let b;
  if (col.typtype === "e" || (isArray && enums.has(base))) {
    b = `${camel(base)}(${name})`;
  } else {
    const m = /\((\d+)(?:,(\d+))?\)/.exec(col.ftype);
    switch (base) {
      case "uuid":
        b = `${use("uuid")}(${name})`;
        break;
      case "text":
        b = `${use("text")}(${name})`;
        break;
      case "varchar":
        b = `${use("varchar")}(${name}${m ? `, { length: ${m[1]} }` : ""})`;
        break;
      case "bpchar":
        b = `${use("char")}(${name}, { length: ${m ? m[1] : 1} })`;
        break;
      case "bool":
        b = `${use("boolean")}(${name})`;
        break;
      case "int2":
        b = `${use("smallint")}(${name})`;
        break;
      case "int4":
        b = `${use("integer")}(${name})`;
        break;
      case "int8":
        b = `${use("bigint")}(${name}, { mode: "number" })`;
        break;
      case "float4":
        b = `${use("real")}(${name})`;
        break;
      case "float8":
        b = `${use("doublePrecision")}(${name})`;
        break;
      case "numeric":
        b = `${use("numeric")}(${name}${m ? `, { precision: ${m[1]}${m[2] !== undefined ? `, scale: ${m[2]}` : ""} }` : ""})`;
        break;
      case "timestamptz":
        b = `${use("timestamp")}(${name}, { withTimezone: true, mode: "date" })`;
        break;
      case "timestamp":
        b = `${use("timestamp")}(${name}, { mode: "date" })`;
        break;
      case "date":
        b = `${use("date")}(${name}, { mode: "string" })`;
        break;
      case "jsonb":
        b = `${use("jsonb")}(${name})`;
        break;
      case "geography":
        needsGeography = true;
        b = `geography(${name})`;
        break;
      case "vector":
        needsVector = true;
        b = `vector(${name})`;
        break;
      default:
        throw new Error(
          `Tipo sem mapeamento: ${col.ftype} (${tableName}.${col.attname}). Acrescente em scripts/gen-db-schema.mjs.`,
        );
    }
  }
  if (isArray) b += ".array()";
  return b;
}

function defaultOf(col, tableName) {
  const key = `${tableName}.${col.attname}`;
  if (OVERRIDES[key]) return OVERRIDES[key];
  if (col.attidentity === "a") return ".generatedAlwaysAsIdentity()";
  if (col.attidentity === "d") return ".generatedByDefaultAsIdentity()";
  if (col.attgenerated === "s") {
    needsSql = true;
    return `.generatedAlwaysAs(sql\`${col.def.replaceAll("`", "\\`")}\`)`;
  }
  const d = col.def;
  if (d == null) return "";
  if (d === "gen_random_uuid()") return ".defaultRandom()";
  if (d === "now()") return ".defaultNow()";
  if (d === "true" || d === "false") return `.default(${d})`;
  let m = /^'(.*)'::[\w. "]+$/.exec(d);
  if (m && !/\bsetting\b/.test(d)) return `.default(${q(m[1].replaceAll("''", "'"))})`;
  m = /^\(?(-?\d+(?:\.\d+)?)\)?$/.exec(d);
  if (m)
    return ["int2", "int4", "int8", "float4", "float8"].includes(col.typname)
      ? `.default(${m[1]})`
      : `.default(${q(m[1])})`;
  needsSql = true;
  return `.default(sql\`${d.replaceAll("`", "\\`")}\`)`;
}

function emitObject(name, o) {
  const tsName = camel(name);
  const single = o.pk.length === 1 ? o.pk[0] : null;
  const lines = [];
  for (const c of o.cols) {
    let s = `  ${camel(c.attname)}: ${builder(c, name)}`;
    if (o.kind === "r") {
      if (single === c.attname) s += ".primaryKey()";
      if (c.attnotnull && single !== c.attname) s += ".notNull()";
      s += defaultOf(c, name);
      const fk = o.fks.get(c.attname);
      if (fk) s += `.references((): AnyPgColumn => ${camel(fk.table)}.${camel(fk.col)})`;
    } else if (c.attnotnull) {
      s += ".notNull()";
    }
    lines.push(`${s},`);
  }
  const notes = [];
  if (o.kind === "r" && o.pk.length > 1)
    notes.push(`chave primária composta: (${o.pk.join(", ")})`);
  for (const f of o.compositeFks) notes.push(`FK composta: ${f}`);
  for (const f of o.externalFks) notes.push(`FK: ${f}`);
  const doc = notes.length ? `/** ${notes.join(" · ")} */\n` : "";
  if (o.kind === "r") {
    let extra = "";
    if (o.pk.length > 1) {
      use("primaryKey");
      extra = `, (t) => [primaryKey({ columns: [${o.pk.map((c) => `t.${camel(c)}`).join(", ")}] })]`;
    }
    return `${doc}export const ${tsName} = pgTable(${q(name)}, {\n${lines.join("\n")}\n}${extra});\n`;
  }
  const fn = o.kind === "m" ? use("pgMaterializedView") : use("pgView");
  return `${doc}export const ${tsName} = ${fn}(${q(name)}, {\n${lines.join("\n")}\n}).existing();\n`;
}

// Ordena por seção; o que sobrar vai para "Outras"
const placed = new Set();
const blocks = [];
for (const [title, names] of SECTIONS) {
  const present = names.filter((n) => objects.has(n));
  for (const n of present) placed.add(n);
  if (present.length) blocks.push([title, present]);
}
const rest = [...objects.keys()].filter((n) => !placed.has(n)).sort();
if (rest.length) blocks.push(["Outras", rest]);

let body = "";
const tableNames = [];
const viewNames = [];
for (const [title, names] of blocks) {
  body += `\n// ${"─".repeat(3)} ${title} ${"─".repeat(Math.max(3, 74 - title.length))}\n\n`;
  for (const n of names) {
    body += emitObject(n, objects.get(n)) + "\n";
    (objects.get(n).kind === "r" ? tableNames : viewNames).push(camel(n));
  }
}

let enumBody = "";
for (const [name, labels] of enums) {
  enumBody += `export const ${camel(name)} = ${use("pgEnum")}(${q(name)}, [${labels.map(q).join(", ")}]);\n`;
}

const custom = [];
if (needsGeography)
  custom.push(
    `/** PostGIS \`geography\`: o valor trafega como texto (EWKB hex); consultas espaciais usam \`sql\`. */\nconst geography = customType<{ data: string }>({ dataType: () => "geography" });`,
  );
if (needsVector)
  custom.push(
    `/** pgvector. */\nconst vector = customType<{ data: string }>({ dataType: () => "vector" });`,
  );
if (custom.length) use("customType");
use("pgTable");

const drizzleImports = [...usedImports].sort();
const header = `/**
 * SCHEMA DO BANCO — todas as tabelas, views e colunas (schema \`public\`), em Drizzle.
 *
 * ⚠ ARQUIVO GERADO por \`pnpm db:schema\` a partir do banco. NÃO edite à mão.
 *   Para mudar o modelo: crie uma migração em \`supabase/migrations\`, aplique-a e rode \`pnpm db:schema\`.
 *
 * O que está aqui: tabelas, colunas, tipos, nulabilidade, valores padrão, colunas geradas, chaves
 * primárias e chaves estrangeiras simples. O que NÃO está (vive na migração SQL, que é a fonte da
 * verdade): CHECKs, índices, RLS/políticas, gatilhos e funções. Ver docs/adr/0006.
 * Dinheiro = \`bigint\` em unidade menor da moeda; datas = \`timestamptz\` (UTC).
 */
${needsSql ? 'import { sql } from "drizzle-orm";\n' : ""}import {
  type AnyPgColumn,
${drizzleImports.map((i) => `  ${i},`).join("\n")}
} from "drizzle-orm/pg-core";

${custom.join("\n\n")}${custom.length ? "\n\n" : ""}// ─── Tipos enumerados ${"─".repeat(56)}

${enumBody}`;

const footer = `
/** Todas as tabelas: o teste \`schema.integration.test.ts\` confere cada uma contra o banco real. */
export const tables = { ${tableNames.join(", ")} } as const;
/** Views e views materializadas. */
export const views = { ${viewNames.join(", ")} } as const;
`;

writeFileSync(out, header + body + footer);
// Formata com o mesmo Biome do projeto: o arquivo é para ser LIDO.
execSync(`pnpm exec biome check --write "${out}"`, {
  stdio: "ignore",
  cwd: resolve(import.meta.dirname, "../.."),
});
console.log(
  `Schema gravado em ${out}: ${tableNames.length} tabelas, ${viewNames.length} views, ${enums.size} enums.`,
);
