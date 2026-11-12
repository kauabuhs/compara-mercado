import type { ContributionStatus, MyContribution } from "../../../contracts";
import { DbError } from "../../../database/errors";
import type { Db } from "../../../database/supabase";
import { pageOffset } from "../../../lib/pagination";
import type { ContributionRepository } from "../contributions.types";

export const CONTRIBUTIONS_BUCKET = "contributions";

function throwIfError(operation: string, error: { message: string; code?: string } | null) {
  if (error) throw new DbError(`${operation}: ${error.message}`, error.code, { cause: error });
}

/**
 * Persistência do módulo, sempre com o cliente do próprio usuário: a RLS e as políticas do bucket
 * `contributions` são a barreira (a API não usa `service_role`).
 */
export function createContributionRepository(userDb: Db): ContributionRepository {
  return {
    async targetsAreActive(storeId, productId) {
      const [store, product] = await Promise.all([
        userDb.from("stores").select("id").eq("id", storeId).eq("status", "active").maybeSingle(),
        userDb
          .from("products")
          .select("id")
          .eq("id", productId)
          .eq("status", "active")
          .maybeSingle(),
      ]);
      throwIfError("targetsAreActive.store", store.error);
      throwIfError("targetsAreActive.product", product.error);
      return store.data !== null && product.data !== null;
    },

    async countSourcesSince(userId, sinceIso) {
      const { count, error } = await userDb
        .from("sources")
        .select("id", { count: "exact", head: true })
        .eq("uploaded_by", userId)
        .gte("created_at", sinceIso);
      throwIfError("countSourcesSince", error);
      return count ?? 0;
    },

    async findOwnSource(userId, sha256) {
      const { data, error } = await userDb
        .from("sources")
        .select("id")
        .eq("uploaded_by", userId)
        .eq("sha256", sha256)
        .maybeSingle();
      throwIfError("findOwnSource", error);
      if (!data) return null;
      const { count, error: observationError } = await userDb
        .from("price_observations")
        .select("id", { count: "exact", head: true })
        .eq("source_id", data.id);
      throwIfError("findOwnSource.observation", observationError);
      return { id: data.id, hasObservation: (count ?? 0) > 0 };
    },

    async uploadPhoto(path, bytes) {
      const { error } = await userDb.storage.from(CONTRIBUTIONS_BUCKET).upload(path, bytes, {
        contentType: "image/jpeg",
        upsert: false,
      });
      // O erro do Storage não traz SQLSTATE; a mensagem fica em `cause` para o log.
      if (error) throw new DbError(`uploadPhoto: ${error.message}`, undefined, { cause: error });
    },

    async insertSource({ userId, storeId, path, sha256 }) {
      const { data, error } = await userDb
        .from("sources")
        .insert({
          store_id: storeId,
          kind: "label",
          file_path: path,
          sha256,
          uploaded_by: userId,
        })
        .select("id")
        .single();
      throwIfError("insertSource", error);
      if (!data) throw new DbError("insertSource: sem retorno");
      return data.id;
    },

    async insertObservation({ userId, storeId, productId, priceCents, promo, sourceId }) {
      const { data, error } = await userDb
        .from("price_observations")
        .insert({
          store_id: storeId,
          product_id: productId,
          price_cents: priceCents,
          unit_price_cents: 1, // recalculado pelo trigger a partir do tamanho do produto
          promo,
          source: "label_photo",
          source_id: sourceId,
          status: "pending",
          // 0 = ainda não avaliado: o preço foi digitado por uma pessoa, não lido por IA.
          confidence: 0,
          created_by: userId,
        })
        .select("id")
        .single();
      throwIfError("insertObservation", error);
      if (!data) throw new DbError("insertObservation: sem retorno");
      return data.id;
    },

    async listMine(userId, { page, pageSize }) {
      const from = pageOffset(page, pageSize);
      const { data, error, count } = await userDb
        .from("price_observations")
        .select("id,price_cents,promo,status,created_at,stores(name),products(canonical_name)", {
          count: "exact",
        })
        .eq("created_by", userId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + pageSize - 1);
      throwIfError("listMine", error);
      return {
        total: count ?? 0,
        items: (data ?? []).map(
          (row): MyContribution => ({
            id: row.id,
            productName: row.products?.canonical_name ?? null,
            storeName: row.stores?.name ?? null,
            priceCents: row.price_cents,
            promo: row.promo,
            status: row.status as ContributionStatus,
            createdAt: row.created_at,
          }),
        ),
      };
    },
  };
}
