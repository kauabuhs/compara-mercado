// Gera a migração com a biblioteca de cidades (municípios do IBGE).
//
//   node scripts/gen-ibge-municipios.mjs <caminho-da-nova-migracao>
//
// A migração é congelada no repositório (determinística, sem rede em runtime). Rode o script só
// para atualizar a lista (novos municípios) gravando uma NOVA migração, por exemplo
// ComparaMercado-Back/supabase/migrations/<timestamp>_ibge_municipios_atualizacao.sql: nunca
// sobrescreva uma migração já aplicada, por isso o caminho é obrigatório.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome";
const MIN_EXPECTED = 5_500;

const target = process.argv[2];
if (!target) {
  console.error("Uso: node scripts/gen-ibge-municipios.mjs <caminho-da-nova-migracao>");
  process.exit(1);
}
// Relativo à raiz do repositório (e não ao diretório de onde o comando foi chamado).
const out = resolve(import.meta.dirname, "..", target);

const response = await fetch(SOURCE, { signal: AbortSignal.timeout(60_000) });
if (!response.ok) throw new Error(`IBGE respondeu ${response.status}`);
const raw = await response.json();
if (!Array.isArray(raw)) throw new Error("resposta inesperada do IBGE");

/** UF pela microrregião; cai para a região imediata quando a microrregião vem nula. */
const ufOf = (item) =>
  item?.microrregiao?.mesorregiao?.UF?.sigla ??
  item?.["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla ??
  null;

const rows = [];
for (const item of raw) {
  const code = String(item.id);
  const uf = ufOf(item);
  if (!/^\d{7}$/.test(code) || !/^[A-Z]{2}$/.test(uf ?? "") || !item.nome) {
    throw new Error(`município inválido: ${JSON.stringify(item).slice(0, 120)}`);
  }
  rows.push({ code, name: String(item.nome).trim(), uf });
}
if (rows.length < MIN_EXPECTED)
  throw new Error(`só ${rows.length} municípios; esperado ≥ ${MIN_EXPECTED}`);
if (new Set(rows.map((row) => row.code)).size !== rows.length)
  throw new Error("códigos IBGE repetidos");

rows.sort((a, b) => a.code.localeCompare(b.code));

const sqlText = (value) => `'${value.replaceAll("'", "''")}'`;
const values = rows
  .map((row) => `  (${sqlText(row.code)}, ${sqlText(row.name)}, ${sqlText(row.uf)})`)
  .join(",\n");

const sql = `-- Biblioteca de cidades: municípios do IBGE (ADR-0014)
--
-- GERADO por scripts/gen-ibge-municipios.mjs a partir de ${SOURCE}
-- (${rows.length} municípios). Não edite à mão: para atualizar, gere uma nova migração.
--
-- Entram desabilitados (\`active = false\`): quem escolhe a cidade só a "adota" pessoalmente (cookie/
-- perfil); ela passa a ser habilitada no comparador quando a primeira loja ativa aparece (gatilho
-- da migração seguinte). Idempotente: o que já existe (cadastrado pelo admin, mesmo código IBGE ou
-- mesmo nome na mesma região) não é tocado.
-- A região (\`region_id\`) é resolvida pelo gatilho \`cities_bi_region\`.

insert into public.cities (ibge_code, name, uf, active)
select v.ibge_code, v.name, v.uf, false
from (values
${values}
) as v (ibge_code, name, uf)
on conflict do nothing;
`;

writeFileSync(out, sql, "utf8");
console.log(`${rows.length} municípios gravados em ${out}`);
