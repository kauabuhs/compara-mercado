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

// --- 1. Coleta de arquivos e imports --------------------------------------------------------
function listDirectories(parent) {
  const parentPath = path.join(root, parent);
  if (!fs.existsSync(parentPath)) return [];
  return fs
    .readdirSync(parentPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${parent}/${entry.name}`);
}

const sourceDirectories = [
  "frontend",
  ...listDirectories("frontend/packages"),
  ...listDirectories("backend/apps"),
  ...listDirectories("backend/packages"),
  ...listDirectories("shared"),
]
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
  if (specifier.startsWith("@/")) base = `frontend/src/${specifier.slice(2)}`;
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

/** Unidade (workspace) a que o arquivo pertence. */
function unitOf(filePath) {
  const parts = filePath.split("/");
  if (parts[0] === "frontend") {
    return parts[1] === "packages" ? parts.slice(0, 3).join("/") : "frontend";
  }
  if (parts[0] === "backend") return parts.slice(0, 3).join("/");
  return parts.slice(0, 2).join("/");
}
const sideOf = (filePath) => filePath.split("/")[0]; // frontend | backend | shared

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

// R2 — direção das dependências entre workspaces
const ALLOWED_WORKSPACE_DEPENDENCIES = {
  "shared/config": [],
  "shared/contracts": [],
  "backend/packages/domain": [],
  "backend/packages/ingest": ["domain"],
  "backend/packages/ai": [],
  "backend/packages/db": ["contracts", "domain"],
  "backend/apps/api": ["contracts", "db", "domain"],
  "backend/apps/worker": ["ai", "db", "domain", "ingest"],
  "frontend/packages/ui": ["contracts"],
  frontend: ["contracts", "ui"],
};
for (const [filePath, fileImports] of imports) {
  const unit = unitOf(filePath);
  const allowed = ALLOWED_WORKSPACE_DEPENDENCIES[unit];
  for (const { specifier } of fileImports) {
    if (!specifier.startsWith("@compara/")) continue;
    const [, name, ...deepPath] = specifier.split("/");
    if (deepPath.length) {
      fail("R2-import-profundo", filePath, `${specifier} (use só o ponto de entrada do pacote)`);
    }
    if (name === "config") continue;
    if (!allowed?.includes(name)) {
      fail("R2-direção", filePath, `${unit} não pode depender de @compara/${name}`);
    }
  }
}

// R3 — front-end e back-end não se enxergam; shared não conhece nenhum dos dois
for (const [filePath, fileImports] of imports) {
  const side = sideOf(filePath);
  for (const { local } of fileImports) {
    if (!local) continue;
    const targetSide = sideOf(local);
    if (targetSide === side) continue;
    const isAllowedCrossing = targetSide === "shared";
    if (!isAllowedCrossing) {
      fail("R3-lados", filePath, `${side} não pode importar ${targetSide} (${local})`);
    }
  }
}

// R4 — pacotes puros não tocam framework, banco, rede nem Node
const PURE_UNITS = ["backend/packages/domain", "backend/packages/ingest", "shared/contracts"];
const FORBIDDEN_IN_PURE =
  /^(@supabase\/|next($|\/)|react($|\/)|hono($|\/)|@hono\/|pg-boss|pg$|@anthropic-ai\/|pino|node:)/;
for (const [filePath, fileImports] of imports) {
  if (!PURE_UNITS.includes(unitOf(filePath))) continue;
  for (const { specifier } of fileImports) {
    if (FORBIDDEN_IN_PURE.test(specifier)) {
      fail("R4-pureza", filePath, `pacote puro não pode importar "${specifier}"`);
    }
  }
}

// R5 — front-end: features isoladas entre si; shared não conhece features nem app
const featureOf = (filePath) => filePath.match(/^frontend\/src\/features\/([^/]+)\//)?.[1] ?? null;
for (const [filePath, fileImports] of imports) {
  if (!filePath.startsWith("frontend/src/")) continue;
  const feature = featureOf(filePath);
  for (const { local } of fileImports) {
    if (!local) continue;
    const targetFeature = featureOf(local);
    if (feature && targetFeature && feature !== targetFeature) {
      fail(
        "R5-feature",
        filePath,
        `feature "${feature}" não pode importar a feature "${targetFeature}" (${local})`,
      );
    }
    if (
      filePath.startsWith("frontend/src/shared/") &&
      (targetFeature || local.startsWith("frontend/src/app/"))
    ) {
      fail("R5-shared", filePath, `shared não pode depender de features/app (${local})`);
    }
    if (feature && local.startsWith("frontend/src/app/")) {
      fail("R5-camadas", filePath, `feature não pode depender de app/ (${local})`);
    }
  }
}

// R6 — front-end: código de navegador não toca código de servidor; Supabase só para sessão
const isComponentFile = (filePath) =>
  /\/components\//.test(filePath) && filePath.startsWith("frontend/src/");
const SERVER_ONLY_LOCAL = /^frontend\/src\/shared\/(server|api)\//;
for (const [filePath, fileImports] of imports) {
  if (!filePath.startsWith("frontend/src/")) continue;
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
    if (isSupabaseImport && !filePath.startsWith("frontend/src/shared/server/supabase/")) {
      fail(
        "R6-supabase",
        filePath,
        "o front só usa o Supabase para sessão, em shared/server/supabase/",
      );
    }
  }
}

// R7 — segredos: service_role só no worker; segredos do back-end nunca aparecem no front-end
const SERVICE_ROLE_ALLOWED_PREFIXES = ["backend/apps/worker/", "backend/packages/db/"];
const BACKEND_SECRET_NAMES = /SERVICE_ROLE|ANTHROPIC_API_KEY|DATABASE_URL/;
for (const [filePath, source] of sources) {
  const usesServiceRole = /createServiceClient|SERVICE_ROLE/.test(source);
  const isAllowed = SERVICE_ROLE_ALLOWED_PREFIXES.some((prefix) => filePath.startsWith(prefix));
  if (usesServiceRole && !isAllowed) {
    fail("R7-segredo", filePath, "service_role só pode ser usado em backend/apps/worker");
  }
  if (sideOf(filePath) === "frontend" && BACKEND_SECRET_NAMES.test(source)) {
    fail("R7-segredo", filePath, "o front-end não pode referenciar segredos do back-end");
  }
}

// R8 — API: rotas e camada HTTP não tocam persistência; só os serviços falam com o banco
for (const [filePath, fileImports] of imports) {
  if (!/^backend\/apps\/api\/src\/(routes|http)\//.test(filePath)) continue;
  for (const { specifier } of fileImports) {
    if (specifier === "@compara/db" || specifier.startsWith("@supabase/")) {
      fail(
        "R8-api",
        filePath,
        `rotas/HTTP não acessam persistência ("${specifier}"): use services/`,
      );
    }
  }
}

// R9 — worker: o pipeline (aplicação) não conhece infraestrutura; só main/jobs/supabase-repo ligam tudo
const WORKER_INFRASTRUCTURE_FILES = new Set([
  "backend/apps/worker/src/main.ts",
  "backend/apps/worker/src/jobs.ts",
  "backend/apps/worker/src/pipeline/supabase-repo.ts",
]);
for (const [filePath, fileImports] of imports) {
  const isWorkerFile = filePath.startsWith("backend/apps/worker/src/");
  if (!isWorkerFile || WORKER_INFRASTRUCTURE_FILES.has(filePath)) continue;
  for (const { specifier, local } of fileImports) {
    const isInfrastructure =
      /^(@supabase\/|pg-boss)/.test(specifier) ||
      specifier === "@compara/db" ||
      local?.endsWith("supabase-repo.ts");
    if (isInfrastructure) {
      fail(
        "R9-worker",
        filePath,
        `fora de main/jobs/supabase-repo não se importa infraestrutura ("${specifier}")`,
      );
    }
  }
}

// --- 3. Resultado ---------------------------------------------------------------------------
const unitCount = Object.keys(ALLOWED_WORKSPACE_DEPENDENCIES).length;
if (violations.length) {
  console.error(`✖ ${violations.length} violação(ões) de arquitetura:\n`);
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(
    '\nRegras e justificativas: docs/architecture.md (seção "Fronteiras verificadas").',
  );
  process.exit(1);
}
console.log(
  `✔ arquitetura ok — ${files.length} arquivos, ${unitCount} unidades, 9 regras (ciclos, direção, lados, pureza, features, navegador, segredos, api, worker)`,
);
