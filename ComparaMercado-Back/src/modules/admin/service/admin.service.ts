import type {
  ContributionStatus,
  ModerationItem,
  PendingObservation,
  ReportReason,
  SizeUnit,
} from "../../../contracts";
import { DbError } from "../../../database/errors";
import type { Db } from "../../../database/supabase";
import { pageOffset } from "../../../lib/pagination";
import type { AdminService } from "../admin.types";

// Ofertas valem até o fim do dia, no horário de Brasília.
const END_OF_DAY_BRASILIA = "T23:59:59-03:00";

/** Tarefas de revisão ainda sem decisão. */
const OPEN_TASK_STATUSES: ("open" | "in_progress")[] = ["open", "in_progress"];

function throwIfError(operation: string, error: { message: string; code?: string } | null) {
  if (error) throw new DbError(`${operation}: ${error.message}`, error.code, { cause: error });
}

export function createAdminService(userDb: Db): AdminService {
  return {
    async getOverview() {
      const [pendingReviews, activeStores, activeProducts, currentPrices, openTasks] =
        await Promise.all([
          userDb
            .from("price_observations")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending"),
          userDb.from("stores").select("id", { count: "exact", head: true }).eq("status", "active"),
          userDb
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("status", "active"),
          userDb.from("current_prices").select("store_id", { count: "exact", head: true }),
          userDb
            .from("review_tasks")
            .select("id", { count: "exact", head: true })
            .eq("target_type", "price_observation")
            .in("status", OPEN_TASK_STATUSES),
        ]);
      throwIfError("getOverview.pendingReviews", pendingReviews.error);
      throwIfError("getOverview.activeStores", activeStores.error);
      throwIfError("getOverview.activeProducts", activeProducts.error);
      throwIfError("getOverview.currentPrices", currentPrices.error);
      throwIfError("getOverview.openTasks", openTasks.error);
      return {
        pendingReviews: pendingReviews.count ?? 0,
        activeStores: activeStores.count ?? 0,
        activeProducts: activeProducts.count ?? 0,
        currentPrices: currentPrices.count ?? 0,
        openModerationTasks: openTasks.count ?? 0,
      };
    },

    async getPriceFormOptions() {
      const [stores, products] = await Promise.all([
        userDb.from("stores").select("id,name").eq("status", "active").order("name"),
        userDb
          .from("products")
          .select("id,canonical_name,brand,size_value,size_unit")
          .eq("status", "active")
          .order("canonical_name"),
      ]);
      throwIfError("getPriceFormOptions.stores", stores.error);
      throwIfError("getPriceFormOptions.products", products.error);
      return {
        stores: (stores.data ?? []).map((store) => ({ id: store.id, name: store.name })),
        products: (products.data ?? []).map((product) => ({
          id: product.id,
          name: product.canonical_name,
          brand: product.brand,
          sizeValue: Number(product.size_value),
          sizeUnit: product.size_unit as SizeUnit,
        })),
      };
    },

    async getReviewQueue({ page, pageSize }) {
      const from = pageOffset(page, pageSize);
      const { data, error, count } = await userDb
        .from("price_observations")
        .select(
          "id,price_cents,unit_price_cents,promo,source,confidence,observed_at,created_at,sources(kind),stores(name),products(canonical_name,brand)",
          { count: "exact" },
        )
        .eq("status", "pending")
        // `id` desempata observações criadas no mesmo instante: a página 2 nunca repete a 1
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      throwIfError("getReviewQueue", error);
      return {
        total: count ?? 0,
        items: (data ?? []).map(
          (row): PendingObservation => ({
            id: row.id,
            productName: row.products?.canonical_name ?? null,
            storeName: row.stores?.name ?? null,
            source: row.source,
            confidence: row.confidence === null ? null : Number(row.confidence),
            priceCents: row.price_cents,
            hasPhoto: row.sources?.kind === "label",
            createdAt: row.created_at,
          }),
        ),
      };
    },

    async createManualPrice(request, adminUserId) {
      const { error } = await userDb.from("price_observations").insert({
        store_id: request.storeId,
        product_id: request.productId,
        price_cents: request.priceCents,
        unit_price_cents: 1, // recalculado pelo trigger a partir do tamanho do produto
        promo: request.promo,
        valid_to: request.validTo ? `${request.validTo}${END_OF_DAY_BRASILIA}` : null,
        source: "manual",
        status: "approved",
        created_by: adminUserId,
      });
      throwIfError("createManualPrice", error);
      // Nasce aprovado (o gatilho de mudança de status não dispara): sem o refresh o preço só
      // apareceria no comparador no próximo ciclo do cron.
      const refresh = await userDb.rpc("refresh_current_prices");
      throwIfError("createManualPrice.refresh", refresh.error);
    },

    async reviewObservation(observationId, decision, note) {
      const { data: decided, error } = await userDb
        .from("price_observations")
        // o motivo só faz sentido na rejeição; aprovar não grava nota
        .update(
          decision === "rejected"
            ? { status: decision, review_note: note ?? null }
            : { status: decision },
        )
        .eq("id", observationId)
        .eq("status", "pending")
        .select("id");
      throwIfError("reviewObservation", error);
      // Aprovar publica o preço: o gatilho do banco já atualiza `current_prices` na mesma transação.
      return Boolean(decided?.length);
    },

    async getModerationQueue({ page, pageSize }) {
      const from = pageOffset(page, pageSize);
      const {
        data: tasks,
        error,
        count,
      } = await userDb
        .from("review_tasks")
        .select("id,target_id,reason,created_at", { count: "exact" })
        .eq("target_type", "price_observation")
        .in("status", OPEN_TASK_STATUSES)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      throwIfError("getModerationQueue.tasks", error);
      const observationIds = (tasks ?? []).map((task) => task.target_id);
      if (observationIds.length === 0) return { total: count ?? 0, items: [] };

      const [observations, reports, changes] = await Promise.all([
        userDb
          .from("price_observations")
          .select("id,price_cents,promo,status,sources(kind),stores(name),products(canonical_name)")
          .in("id", observationIds),
        userDb
          .from("observation_reports")
          .select("observation_id,reason")
          .in("observation_id", observationIds),
        userDb
          .from("observation_confirmations")
          .select("observation_id")
          .eq("verdict", "changed")
          .in("observation_id", observationIds),
      ]);
      throwIfError("getModerationQueue.observations", observations.error);
      throwIfError("getModerationQueue.reports", reports.error);
      throwIfError("getModerationQueue.changes", changes.error);

      const observationById = new Map((observations.data ?? []).map((row) => [row.id, row]));
      const reportsByObservation = new Map<string, Map<ReportReason, number>>();
      for (const report of reports.data ?? []) {
        const reasons = reportsByObservation.get(report.observation_id) ?? new Map();
        reasons.set(report.reason, (reasons.get(report.reason) ?? 0) + 1);
        reportsByObservation.set(report.observation_id, reasons);
      }
      const changesByObservation = new Map<string, number>();
      for (const row of changes.data ?? []) {
        const previous = changesByObservation.get(row.observation_id) ?? 0;
        changesByObservation.set(row.observation_id, previous + 1);
      }

      const items: ModerationItem[] = [];
      for (const task of tasks ?? []) {
        const observation = observationById.get(task.target_id);
        if (!observation) continue; // tarefa órfã: nada a decidir aqui
        const reasonCounts = reportsByObservation.get(observation.id) ?? new Map();
        items.push({
          taskId: task.id,
          observationId: observation.id,
          reason: task.reason,
          status: observation.status as ContributionStatus,
          productName: observation.products?.canonical_name ?? null,
          storeName: observation.stores?.name ?? null,
          priceCents: observation.price_cents,
          promo: observation.promo,
          hasPhoto: observation.sources?.kind === "label",
          reports: [...reasonCounts].map(([reason, reasonCount]) => ({
            reason,
            count: reasonCount,
          })),
          changes: changesByObservation.get(observation.id) ?? 0,
          createdAt: task.created_at,
        });
      }
      return { total: count ?? 0, items };
    },

    async resolveModerationTask(taskId, { action, note }, adminUserId) {
      const { data: task, error } = await userDb
        .from("review_tasks")
        .select("id,target_id")
        .eq("id", taskId)
        .eq("target_type", "price_observation")
        .in("status", OPEN_TASK_STATUSES)
        .maybeSingle();
      throwIfError("resolveModerationTask.find", error);
      if (!task) return false;

      if (action !== "keep") {
        // Aprovar só vale para preço pendente; rejeitar também retira um preço já publicado. Se o
        // preço já foi decidido por outra via, nada muda e a tarefa é encerrada logo abaixo.
        const { error: decideError } = await userDb
          .from("price_observations")
          .update(
            action === "approve"
              ? { status: "approved" as const }
              : { status: "rejected" as const, review_note: note ?? null },
          )
          .eq("id", task.target_id)
          .in("status", action === "approve" ? ["pending"] : ["pending", "approved"]);
        throwIfError("resolveModerationTask.decide", decideError);
      }

      // Decidir o preço já fecha a tarefa (gatilho); aqui cobre "manter" e o preço já decidido antes.
      const { error: closeError } = await userDb
        .from("review_tasks")
        .update({
          status: "dismissed",
          resolved_at: new Date().toISOString(),
          resolved_by: adminUserId,
        })
        .eq("id", task.id)
        .in("status", OPEN_TASK_STATUSES);
      throwIfError("resolveModerationTask.close", closeError);
      return true;
    },

    async getObservationPhoto(observationId) {
      const { data, error } = await userDb
        .from("price_observations")
        .select("sources(kind,file_path)")
        .eq("id", observationId)
        .maybeSingle();
      throwIfError("getObservationPhoto", error);
      const source = data?.sources;
      // Só fotos de etiqueta moram no bucket privado `contributions` (encartes são outro fluxo).
      if (source?.kind !== "label") return null;
      const { data: file, error: downloadError } = await userDb.storage
        .from("contributions")
        .download(source.file_path);
      if (downloadError) {
        throw new DbError(`getObservationPhoto.download: ${downloadError.message}`, undefined, {
          cause: downloadError,
        });
      }
      return new Uint8Array(await file.arrayBuffer());
    },
  };
}
