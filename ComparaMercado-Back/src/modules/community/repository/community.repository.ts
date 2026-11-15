import { z } from "zod";
import { BaseUnitSchema, ConfirmationVerdictSchema, SizeUnitSchema } from "../../../contracts";
import { DbError } from "../../../database/errors";
import type { Db } from "../../../database/supabase";
import type { CommunityRepository, FeedRow } from "../community.types";

/** Bucket privado das fotos de etiqueta (ADR-0008). A leitura é liberada pela política de Storage. */
const PHOTO_BUCKET = "contributions";

function throwIfError(operation: string, error: { message: string; code?: string } | null) {
  if (error) throw new DbError(`${operation}: ${error.message}`, error.code, { cause: error });
}

// Tudo que volta do banco é validado: o tipo gerado diz o que o Postgres declara, o Zod garante
// o que o app de fato recebe. Nomes de colunas (snake_case) ficam só aqui.
const FeedRowSchema = z
  .object({
    id: z.uuid(),
    created_at: z.string(),
    store_id: z.uuid(),
    store_name: z.string(),
    store_neighborhood: z.string().nullable(),
    distance_m: z.number().int().nullable(),
    product_id: z.uuid(),
    canonical_name: z.string(),
    brand: z.string().nullable(),
    size_value: z.coerce.number(),
    size_unit: SizeUnitSchema,
    base_unit: BaseUnitSchema,
    price_cents: z.number().int(),
    unit_price_cents: z.number().int(),
    promo: z.boolean(),
    valid_to: z.string().nullable(),
    source: z.enum(["manual", "flyer", "label_photo", "receipt", "store_panel"]),
    status: z.enum(["pending", "approved"]),
    approved_via: z.enum(["admin", "community", "trusted_author", "store", "pipeline"]).nullable(),
    confirm_count: z.number().int(),
    changed_count: z.number().int(),
    has_photo: z.boolean(),
    author_label: z.string(),
    author_level: z.number().int().nullable(),
    is_mine: z.boolean(),
    my_verdict: ConfirmationVerdictSchema.nullable(),
  })
  .transform(
    (row): FeedRow => ({
      id: row.id,
      createdAt: row.created_at,
      storeId: row.store_id,
      storeName: row.store_name,
      storeNeighborhood: row.store_neighborhood,
      distanceM: row.distance_m,
      productId: row.product_id,
      productName: row.canonical_name,
      brand: row.brand,
      sizeValue: row.size_value,
      sizeUnit: row.size_unit,
      baseUnit: row.base_unit,
      priceCents: row.price_cents,
      unitPriceCents: row.unit_price_cents,
      promo: row.promo,
      validTo: row.valid_to,
      source: row.source,
      status: row.status,
      approvedVia: row.approved_via,
      confirmCount: row.confirm_count,
      changedCount: row.changed_count,
      hasPhoto: row.has_photo,
      authorLabel: row.author_label,
      authorLevel: row.author_level,
      isMine: row.is_mine,
      myVerdict: row.my_verdict,
    }),
  );

const ConfirmResultSchema = z
  .array(
    z.object({
      new_status: z.enum(["pending", "approved"]),
      confirmations: z.number().int(),
      changes: z.number().int(),
    }),
  )
  .min(1);

const ReputationEventSchema = z.object({
  kind: z.enum(["price_approved", "price_rejected", "confirmation_received", "confirmation_given"]),
  points: z.number().int(),
  created_at: z.string(),
});

/**
 * Persistência do módulo, sempre com o cliente do usuário (ou o anônimo, no feed): a RLS e as
 * funções SQL (`list_community_feed`, `confirm_observation`, `report_observation`) são a barreira.
 * A API não usa `service_role`.
 */
export function createCommunityRepository(db: Db): CommunityRepository {
  return {
    async listFeed(filter) {
      const { data, error } = await db.rpc("list_community_feed", {
        p_city_id: filter.cityId,
        ...(filter.where
          ? {
              p_lat: filter.where.lat,
              p_lng: filter.where.lng,
              ...(filter.where.radiusM ? { p_radius_m: filter.where.radiusM } : {}),
            }
          : {}),
        p_promo_only: filter.promoOnly,
        ...(filter.after
          ? { p_before_created_at: filter.after.createdAt, p_before_id: filter.after.id }
          : {}),
        p_limit: filter.limit,
      });
      throwIfError("community.listFeed", error);
      return z.array(FeedRowSchema).parse(data ?? []);
    },

    async confirm(observationId, verdict) {
      const { data, error } = await db.rpc("confirm_observation", {
        p_observation_id: observationId,
        p_verdict: verdict,
      });
      throwIfError("community.confirm", error);
      const [row] = ConfirmResultSchema.parse(data);
      if (!row) throw new DbError("community.confirm: resposta vazia");
      return {
        status: row.new_status,
        confirmCount: row.confirmations,
        changedCount: row.changes,
      };
    },

    async report(observationId, reason) {
      const { error } = await db.rpc("report_observation", {
        p_observation_id: observationId,
        p_reason: reason,
      });
      throwIfError("community.report", error);
    },

    async photoPath(observationId) {
      const { data, error } = await db.rpc("community_photo_path", {
        p_observation_id: observationId,
      });
      throwIfError("community.photoPath", error);
      return typeof data === "string" ? data : null;
    },

    async downloadPhoto(path) {
      const { data, error } = await db.storage.from(PHOTO_BUCKET).download(path);
      if (error) {
        // Sem permissão ou arquivo ausente: para quem pede é "não há foto"; o resto é falha de dados.
        const status = (error as { status?: number; statusCode?: string | number }).status;
        if (status === 400 || status === 403 || status === 404) return null;
        throw new DbError(`community.downloadPhoto: ${error.message}`, undefined, { cause: error });
      }
      return new Uint8Array(await data.arrayBuffer());
    },

    async reputation(userId, eventLimit) {
      const [profile, events] = await Promise.all([
        db.from("profiles").select("reputation").eq("id", userId).maybeSingle(),
        db
          .from("reputation_events")
          .select("kind, points, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(eventLimit),
      ]);
      throwIfError("community.reputation.profile", profile.error);
      throwIfError("community.reputation.events", events.error);
      return {
        points: profile.data?.reputation ?? 0,
        events: z
          .array(ReputationEventSchema)
          .parse(events.data ?? [])
          .map((event) => ({
            kind: event.kind,
            points: event.points,
            createdAt: event.created_at,
          })),
      };
    },
  };
}
