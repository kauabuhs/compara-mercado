#!/usr/bin/env node
/**
 * Verificador de fronteiras arquiteturais (sem dependências externas).
 * Falha com código 1 se alguma regra de docs/architecture.md for quebrada.
 *
 * Uso: pnpm arch:check
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const toRelative = (absolutePath) => path.relative(root, absolutePath).replaceAll("\\", "/");

const BACK = "ComparaMercado-Back";
const BACK_SRC = `${BACK}/src`;
const FRONT = "ComparaMercado-Front";
const FRONT_SRC = `${FRONT}/src`;

// --- 1. Coleta de arquivos e imports --------------------------------------------------------
const sourceDirectories = [BACK, FRONT]
  .map((unitDirectory) => path.join(root, unitDirectory, "src"))
  .filter((sourceDirectory) => fs.existsSync(sourceDirectory));

const files = [];
for (const sourceDirectory of sourceDirectories) {
  (function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(entryPath);
      else if (/\.(ts|tsx|mjs)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        files.push(toRelative(entryPath));
      }
    }
  })(sourceDirectory);
}
const fileSet = new Set(files);

const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^"'\n;]*?\sfrom\s+)?["']([^"']+)["']/g;
const DYNAMIC_RE = /import\(\s*["']([^"']+)["']\s*\)/g;

function resolveLocal(fromFile, specifier) {
  let base;
  if (specifier === "@contracts") base = `${BACK_SRC}/contracts/index`;
  else if (specifier.startsWith("@/")) base = `${FRONT_SRC}/${specifier.slice(2)}`;
  else if (specifier.startsWith(".")) {
    base = path.posix.join(path.posix.dirname(fromFile), specifier);
  } else return null;
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    base.replace(/\.js$/, ".ts"),
  ];
  return candidates.find((candidatePath) => fileSet.has(candidatePath)) ?? null;
}

/** @type {Map<string, {specifier: string, typeOnly: boolean, local: string|null}[]>} */
const imports = new Map();
const sources = new Map();
for (const filePath of files) {
  const source = fs.readFileSync(path.join(root, filePath), "utf8");
  sources.set(filePath, source);
  const fileImports = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    fileImports.push({
      specifier: match[2],
      typeOnly: Boolean(match[1]),
      local: resolveLocal(filePath, match[2]),
    });
  }
  for (const match of source.matchAll(DYNAMIC_RE)) {
    fileImports.push({
      specifier: match[1],
      typeOnly: false,
      local: resolveLocal(filePath, match[1]),
    });
  }
  imports.set(filePath, fileImports);
}

// --- 2. Regras ------------------------------------------------------------------------------
const violations = [];
const fail = (rule, filePath, message) => violations.push(`[${rule}] ${filePath}: ${message}`);

const WORKSPACE_UNITS = [BACK, FRONT];
const sideOf = (filePath) => (filePath.startsWith(`${BACK}/`) ? "back" : "frontend");
const isBack = (filePath) => filePath.startsWith(`${BACK_SRC}/`);

// R1 — sem ciclos entre arquivos
{
  const color = new Map();
  const stack = [];
  const visit = (currentFile) => {
    color.set(currentFile, 1);
    stack.push(currentFile);
    for (const { local, typeOnly } of imports.get(currentFile) ?? []) {
      if (!local || typeOnly) continue;
      if (color.get(local) === 1) {
        fail("R1-ciclo", currentFile, [...stack.slice(stack.indexOf(local)), local].join(" -> "));
      } else if (!color.get(local)) visit(local);
    }
    stack.pop();
    color.set(currentFile, 2);
  };
  for (const filePath of files) if (!color.get(filePath)) visit(filePath);
}

// R2 — nenhum pacote @compara/*: Back e Front são aplicações autocontidas (como no ProAgendaV2).
// O único elo entre elas é o alias @contracts (ver R3).
for (const [filePath, fileImports] of imports) {
  for (const { specifier } of fileImports) {
    if (specifier.startsWith("@compara/")) {
      fail(
        "R2-pacote",
        filePath,
        `${specifier}: não há pacotes compartilhados; use imports locais`,
      );
    }
  }
}

// R3 — front-end e back-end não se enxergam por caminho. Única exceção: o Front lê o contrato HTTP
// (schemas Zod e tipos puros) pelo alias @contracts -> ComparaMercado-Back/src/contracts.
for (const [filePath, fileImports] of imports) {
  const side = sideOf(filePath);
  for (const { local, specifier } of fileImports) {
    if (specifier === "@contracts" && side === "frontend") continue;
    if (local && sideOf(local) !== side) {
      fail("R3-lados", filePath, `${side} não pode importar ${sideOf(local)} (${local})`);
    }
  }
}

// R4 — regras de negócio puras: sem framework, banco, rede, Node nem camadas de infraestrutura
const PURE_FILES = new Set([
  ...["domain-error", "freshness", "gtin", "money", "normalize", "units"].map(
    (name) => `${BACK_SRC}/lib/${name}.ts`,
  ),
  `${BACK_SRC}/modules/catalog/service/compare.ts`,
  ...["golden", "match", "publish", "trigram", "validate"].map(
    (name) => `${BACK_SRC}/modules/ingest/service/${name}.ts`,
  ),
]);
const isPure = (filePath) =>
  PURE_FILES.has(filePath) || filePath.startsWith(`${BACK_SRC}/contracts/`);
const FORBIDDEN_IN_PURE =
  /^(@supabase\/|next($|\/)|react($|\/)|hono($|\/)|@hono\/|pg-boss|pg$|drizzle-orm|@anthropic-ai\/|pino|node:)/;
for (const [filePath, fileImports] of imports) {
  if (!isPure(filePath) || filePath.includes("/__tests__/")) continue;
  for (const { specifier, local } of fileImports) {
    if (FORBIDDEN_IN_PURE.test(specifier)) {
      fail("R4-pureza", filePath, `arquivo de regra pura não pode importar "${specifier}"`);
    }
    if (local && /\/(database|middlewares|repository|controller|jobs)\//.test(`/${local}`)) {
      fail(
        "R4-pureza",
        filePath,
        `arquivo de regra pura não pode importar infraestrutura (${local})`,
      );
    }
  }
}

// R5 — front-end: módulos isolados entre si; as camadas compartilhadas (components, lib, services,
// stores, server, hooks, types) não conhecem módulos nem app. O que dois módulos usam sobe de camada.
const FRONT_SHARED_LAYERS = ["components", "lib", "services", "stores", "server", "hooks", "types"];
const moduleOf = (filePath) =>
  filePath.match(new RegExp(`^${FRONT_SRC}/modules/([^/]+)/`))?.[1] ?? null;
const sharedLayerOf = (filePath) => {
  const layer = filePath.slice(FRONT_SRC.length + 1).split("/")[0] ?? "";
  return FRONT_SHARED_LAYERS.includes(layer) ? layer : null;
};
for (const [filePath, fileImports] of imports) {
  if (!filePath.startsWith(`${FRONT_SRC}/`)) continue;
  const currentModule = moduleOf(filePath);
  const currentLayer = sharedLayerOf(filePath);
  for (const { local } of fileImports) {
    if (!local) continue;
    const targetModule = moduleOf(local);
    if (currentModule && targetModule && currentModule !== targetModule) {
      fail(
        "R5-módulo",
        filePath,
        `módulo "${currentModule}" não pode importar o módulo "${targetModule}" (${local}); o que dois módulos usam vai para stores/, lib/ ou components/`,
      );
    }
    if (currentLayer && (targetModule || local.startsWith(`${FRONT_SRC}/app/`))) {
      fail(
        "R5-camadas",
        filePath,
        `${currentLayer}/ não pode depender de modules/ ou app/ (${local})`,
      );
    }
    if (currentModule && local.startsWith(`${FRONT_SRC}/app/`)) {
      fail("R5-camadas", filePath, `módulo não pode depender de app/ (${local})`);
    }
  }
}

// R6 — front-end: código de navegador não toca código de servidor; Supabase só para sessão
const isComponentFile = (filePath) =>
  /\/components\//.test(filePath) && filePath.startsWith(`${FRONT_SRC}/`);
const SERVER_ONLY_LOCAL = new RegExp(`^${FRONT_SRC}/(server|services/api)/`);
for (const [filePath, fileImports] of imports) {
  if (!filePath.startsWith(`${FRONT_SRC}/`)) continue;
  const isClientCode =
    /^\s*["']use client["']/.test(sources.get(filePath) ?? "") || isComponentFile(filePath);
  for (const { specifier, local } of fileImports) {
    if (isClientCode && (SERVER_ONLY_LOCAL.test(local ?? "") || specifier === "next/headers")) {
      fail(
        "R6-servidor",
        filePath,
        `código de navegador não pode importar código de servidor (${specifier})`,
      );
    }
    const isSupabaseImport = specifier.startsWith("@supabase/");
    if (isSupabaseImport && !filePath.startsWith(`${FRONT_SRC}/server/supabase/`)) {
      fail("R6-supabase", filePath, "o front só usa o Supabase para sessão, em server/supabase/");
    }
  }
}

// R7 — segredos: service_role só no worker/infra; segredos do back-end nunca aparecem no front-end
const SERVICE_ROLE_ALLOWED = [
  `${BACK_SRC}/worker.ts`,
  `${BACK_SRC}/jobs/`,
  `${BACK_SRC}/config/worker-env.ts`,
  `${BACK_SRC}/lib/logger.ts`, // só cita o nome da chave na lista de campos a ocultar nos logs
  `${BACK_SRC}/database/`,
  `${BACK_SRC}/modules/ingest/`,
  `${BACK_SRC}/__tests__/`,
];
const BACKEND_SECRET_NAMES = /SERVICE_ROLE|ANTHROPIC_API_KEY|DATABASE_URL/;
for (const [filePath, source] of sources) {
  const usesServiceRole = /createServiceClient|SERVICE_ROLE/.test(source);
  const isAllowed = SERVICE_ROLE_ALLOWED.some((prefix) => filePath.startsWith(prefix));
  if (usesServiceRole && !isAllowed) {
    fail(
      "R7-segredo",
      filePath,
      "service_role só pode ser usado no worker, jobs, database e testes",
    );
  }
  if (sideOf(filePath) === "frontend" && BACKEND_SECRET_NAMES.test(source)) {
    fail("R7-segredo", filePath, "o front-end não pode referenciar segredos do back-end");
  }
}

// R8 — camada HTTP (controller, middlewares, app) não toca persistência: só o service fala com o repository
const isHttpLayer = (filePath) =>
  /^ComparaMercado-Back\/src\/modules\/[^/]+\/controller\//.test(filePath) ||
  filePath.startsWith(`${BACK_SRC}/middlewares/`) ||
  filePath === `${BACK_SRC}/app.ts`;
for (const [filePath, fileImports] of imports) {
  if (!isHttpLayer(filePath) || filePath.includes("/__tests__/")) continue;
  for (const { specifier, local } of fileImports) {
    const touchesPersistence =
      /^(@supabase\/|drizzle-orm|pg$)/.test(specifier) ||
      (local &&
        /\/(database|repository)\//.test(`/${local}`) &&
        !local.endsWith("/database/errors.ts")); // a classe de erro (DbError) não é persistência
    if (touchesPersistence) {
      fail(
        "R8-http",
        filePath,
        `controller/middlewares não acessam persistência ("${specifier}"): use o service`,
      );
    }
  }
}

// R9 — camadas dos módulos: repository não conhece controller; service não conhece controller;
// o caso de uso do pipeline (service) não conhece infraestrutura (só as portas de pipeline.types.ts)
const layerOf = (filePath) =>
  filePath.match(
    /^ComparaMercado-Back\/src\/modules\/[^/]+\/(controller|service|repository)\//,
  )?.[1];
const PIPELINE_USE_CASE = `${BACK_SRC}/modules/ingest/service/pipeline.service.ts`;
for (const [filePath, fileImports] of imports) {
  if (!isBack(filePath) || filePath.includes("/__tests__/")) continue;
  const layer = layerOf(filePath);
  for (const { specifier, local, typeOnly } of fileImports) {
    const targetLayer = local ? layerOf(local) : undefined;
    if ((layer === "repository" || layer === "service") && targetLayer === "controller") {
      fail("R9-camadas", filePath, `${layer} não pode depender de controller (${local})`);
    }
    if (layer === "repository" && targetLayer === "service" && !typeOnly && !isPure(local)) {
      fail("R9-camadas", filePath, `repository só importa de service regras puras (${local})`);
    }
    if (filePath === PIPELINE_USE_CASE) {
      const infra =
        /^(@supabase\/|pg-boss|pg$|drizzle-orm)/.test(specifier) ||
        (local && /\/(database|repository)\//.test(`/${local}`));
      if (infra) {
        fail(
          "R9-camadas",
          filePath,
          `o caso de uso do pipeline não conhece infraestrutura ("${specifier}")`,
        );
      }
    }
  }
}

// --- 3. Resultado ---------------------------------------------------------------------------
const unitCount = WORKSPACE_UNITS.length;
if (violations.length) {
  console.error(`✖ ${violations.length} violação(ões) de arquitetura:\n`);
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(
    '\nRegras e justificativas: docs/architecture.md (seção "Fronteiras verificadas").',
  );
  process.exit(1);
}
console.log(
  `✔ arquitetura ok — ${files.length} arquivos, ${unitCount} unidades, 9 regras (ciclos, pacotes, lados, pureza, módulos, navegador, segredos, http, camadas)`,
);
