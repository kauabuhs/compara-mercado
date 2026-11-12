import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { OrmDb } from "../../../database/client";
import { withDbErrors } from "../../../database/errors";
import { categories, products, productThumbnails } from "../../../database/schema";
import { normalizeGtin } from "../../../lib/gtin";

// ── Importação de catálogo em lote ──────────────────────────────────────────

export const CatalogImportRow = z.object({
  /** Código de barras (GTIN-8/12/13/14). É a chave de importação: precisa ter dígito verificador válido. */
  gtin: z.string(),
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().min(1).max(80).nullish(),
  /** slug de uma categoria existente; slug desconhecido rejeita a linha. */
  categorySlug: z.string().trim().min(1).nullish(),
  sizeValue: z.number().positive().max(999_999_999),
  sizeUnit: z.enum(["g", "kg", "ml", "l", "un"]),
  packQuantity: z.number().int().min(1).default(1),
  variantLabel: z.string().trim().min(1).max(80).nullish(),
});
export type CatalogImportRow = z.input<typeof CatalogImportRow>;

export interface CatalogImportResult {
  inserted: number;
  updated: number;
  unchanged: number;
  /** Linhas recusadas, com o motivo (índice na lista de entrada). Nada é gravado para elas. */
  rejected: { index: number; gtin?: string; reason: string }[];
}

const CHUNK = 1000;

/**
 * Importa/atualiza variantes por GTIN, em lotes, numa única transação.
 *
 *  - INSERT de novas e UPDATE das existentes são caminhos separados de propósito: o gatilho
 *    `products_resolve_family` roda ANTES do `ON CONFLICT`, então um upsert cego criaria
 *    famílias órfãs ao reimportar um GTIN existente com nome diferente;
 *  - marca e categoria de variantes existentes NÃO mudam por importação (são da família);
 *  - mesma entrada repetida (mesmo GTIN) na lista: vale a última;
 *  - é idempotente: reimportar o mesmo arquivo resulta em `unchanged`.
 */
export async function importCatalog(
  db: OrmDb,
  input: CatalogImportRow[],
): Promise<CatalogImportResult> {
  const result: CatalogImportResult = { inserted: 0, updated: 0, unchanged: 0, rejected: [] };

  // 1. validar e normalizar (a última ocorrência de cada GTIN vence)
  type Valid = z.output<typeof CatalogImportRow> & { index: number; gtinNorm: string };
  const byGtin = new Map<string, Valid>();
  input.forEach((raw, index) => {
    const parsed = CatalogImportRow.safeParse(raw);
    const rawGtin =
      typeof (raw as { gtin?: unknown }).gtin === "string"
        ? (raw as { gtin: string }).gtin
        : undefined;
    if (!parsed.success) {
      result.rejected.push({
        index,
        gtin: rawGtin,
        reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
      return;
    }
    const gtinNorm = normalizeGtin(parsed.data.gtin);
    if (!gtinNorm) {
      result.rejected.push({
        index,
        gtin: rawGtin,
        reason: "GTIN inválido (formato ou dígito verificador)",
      });
      return;
    }
    byGtin.set(gtinNorm, { ...parsed.data, index, gtinNorm });
  });
  const rows = [...byGtin.values()];
  if (rows.length === 0) return result;

  await withDbErrors(() =>
    db.transaction(async (tx) => {
      // 2. categorias por slug (uma consulta)
      const slugs = [...new Set(rows.map((r) => r.categorySlug).filter((s): s is string => !!s))];
      const catRows = slugs.length
        ? await tx
            .select({ id: categories.id, slug: categories.slug })
            .from(categories)
            .where(inArray(categories.slug, slugs))
        : [];
      const catBySlug = new Map(catRows.map((c) => [c.slug, c.id]));

      const valid: (Valid & { categoryId: string | null })[] = [];
      for (const r of rows) {
        if (r.categorySlug && !catBySlug.has(r.categorySlug)) {
          result.rejected.push({
            index: r.index,
            gtin: r.gtinNorm,
            reason: `categoria desconhecida: ${r.categorySlug}`,
          });
          continue;
        }
        valid.push({
          ...r,
          categoryId: r.categorySlug ? (catBySlug.get(r.categorySlug) ?? null) : null,
        });
      }

      for (let off = 0; off < valid.length; off += CHUNK) {
        const chunk = valid.slice(off, off + CHUNK);

        // 3. quais GTINs já existem (uma consulta por lote)
        const existing = await tx
          .select({ gtin: products.gtin })
          .from(products)
          .where(
            inArray(
              products.gtin,
              chunk.map((r) => r.gtinNorm),
            ),
          );
        const existingSet = new Set(existing.map((e) => e.gtin));

        // 4a. novas: INSERT em lote (o gatilho products_resolve_family cria marca e família). Corrida com outra
        //     importação → DO NOTHING, e a linha cai em "unchanged".
        const fresh = chunk.filter((r) => !existingSet.has(r.gtinNorm));
        if (fresh.length) {
          const inserted = await tx
            .insert(products)
            .values(
              fresh.map((r) => ({
                gtin: r.gtinNorm,
                canonicalName: r.name,
                brand: r.brand ?? null,
                categoryId: r.categoryId,
                sizeValue: String(r.sizeValue),
                sizeUnit: r.sizeUnit,
                packQuantity: r.packQuantity,
                variantLabel: r.variantLabel ?? null,
              })),
            )
            .onConflictDoNothing({ target: products.gtin })
            .returning({ id: products.id });
          result.inserted += inserted.length;
          result.unchanged += fresh.length - inserted.length;
        }

        // 4b. existentes: UPDATE em lote, só das linhas que realmente mudam
        const known = chunk.filter((r) => existingSet.has(r.gtinNorm));
        if (known.length) {
          const upd = await tx.execute<{ id: string }>(sql`
            update public.products p
            set canonical_name = v.name, size_value = v.size_value, size_unit = v.size_unit::public.size_unit,
                pack_quantity = v.pack_quantity, variant_label = v.variant_label
            -- arrays entram como UM parâmetro (sql.param); array solto no template viraria lista ($2, $3…)
            from unnest(
              ${sql.param(known.map((r) => r.gtinNorm))}::text[], ${sql.param(known.map((r) => r.name))}::text[],
              ${sql.param(known.map((r) => String(r.sizeValue)))}::numeric[], ${sql.param(known.map((r) => r.sizeUnit))}::text[],
              ${sql.param(known.map((r) => r.packQuantity))}::integer[], ${sql.param(known.map((r) => r.variantLabel ?? null))}::text[]
            ) as v (gtin, name, size_value, size_unit, pack_quantity, variant_label)
            where p.gtin = v.gtin
              and (p.canonical_name, p.size_value, p.size_unit::text, p.pack_quantity, p.variant_label)
                  is distinct from (v.name, v.size_value, v.size_unit, v.pack_quantity, v.variant_label)
            returning p.id`);
          result.updated += upd.rows.length;
          result.unchanged += known.length - upd.rows.length;
        }
      }
    }),
  );

  result.rejected.sort((a, b) => a.index - b.index);
  return result;
}

// ── Listagem paginada por cursor ────────────────────────────────────────────

export interface ProductListItem {
  id: string;
  name: string;
  brand: string | null;
  sizeValue: number;
  sizeUnit: string;
  variantLabel: string | null;
  /** Só a MINIATURA (nunca o original). A URL é `<CDN_BASE_URL>/<thumbKey>`, montada pela API. */
  thumb: { key: string; width: number; height: number; alt: string | null } | null;
}

export interface ProductPage {
  items: ProductListItem[];
  /** Passe em `after` para a próxima página; `null` no fim. */
  nextCursor: string | null;
}

const encodeCursor = (name: string, id: string): string =>
  Buffer.from(JSON.stringify([name, id])).toString("base64url");
function decodeCursor(cursor: string): [string, string] {
  try {
    const v = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (
      Array.isArray(v) &&
      typeof v[0] === "string" &&
      typeof v[1] === "string" &&
      z.uuid().safeParse(v[1]).success
    ) {
      return [v[0], v[1]];
    }
  } catch {
    // cai no erro abaixo
  }
  throw new RangeError("cursor inválido");
}

/**
 * Página de produtos ativos ordenados por (nome, id) com paginação por CURSOR (keyset): custo
 * constante em qualquer profundidade, sem OFFSET. Uma única consulta traz também a miniatura
 * (LEFT JOIN na view), então não há N+1 e o original nunca é lido.
 */
export async function listProductsPage(
  db: OrmDb,
  opts: { categoryId?: string; after?: string; limit?: number },
): Promise<ProductPage> {
  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 100);
  const cursor = opts.after ? decodeCursor(opts.after) : null;

  const rows = await db
    .select({
      id: products.id,
      name: products.canonicalName,
      brand: products.brand,
      sizeValue: products.sizeValue,
      sizeUnit: products.sizeUnit,
      variantLabel: products.variantLabel,
      thumbKey: productThumbnails.thumbKey,
      thumbWidth: productThumbnails.thumbWidth,
      thumbHeight: productThumbnails.thumbHeight,
      thumbAlt: productThumbnails.altText,
    })
    .from(products)
    .leftJoin(productThumbnails, eq(productThumbnails.productId, products.id))
    .where(
      and(
        eq(products.status, "active"),
        opts.categoryId ? eq(products.categoryId, opts.categoryId) : undefined,
        cursor
          ? sql`(${products.canonicalName}, ${products.id}) > (${cursor[0]}, ${cursor[1]}::uuid)`
          : undefined,
      ),
    )
    .orderBy(asc(products.canonicalName), asc(products.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map((r) => ({
      id: r.id,
      name: r.name,
      brand: r.brand,
      sizeValue: Number(r.sizeValue),
      sizeUnit: r.sizeUnit,
      variantLabel: r.variantLabel,
      thumb: r.thumbKey
        ? { key: r.thumbKey, width: r.thumbWidth ?? 0, height: r.thumbHeight ?? 0, alt: r.thumbAlt }
        : null,
    })),
    nextCursor: rows.length > limit && last ? encodeCursor(last.name, last.id) : null,
  };
}
