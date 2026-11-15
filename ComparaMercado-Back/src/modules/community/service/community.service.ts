import type { FeedItem, FeedOrigin, FeedTrust } from "../../../contracts";
import { DbError } from "../../../database/errors";
import { decodeFeedCursor, encodeFeedCursor } from "../../../lib/cursor";
import { DomainError } from "../../../lib/domain-error";
import { nextLevelAt, reputationLevel } from "../../../lib/reputation";
import type {
  CommunityErrorCode,
  CommunityRepository,
  CommunityService,
  FeedRow,
} from "../community.types";

const REPUTATION_EVENTS_SHOWN = 20;

const MESSAGES: Record<CommunityErrorCode, string> = {
  invalid_cursor: "Cursor de paginação inválido.",
  observation_unavailable: "Essa publicação não está mais disponível.",
  own_observation: "Você não pode fazer isso na sua própria publicação.",
  already_done: "Você já respondeu a esta publicação.",
  daily_limit: "Você atingiu o limite de hoje. Volte amanhã.",
};

const fail = (code: CommunityErrorCode) => new DomainError(code, MESSAGES[code]);

/**
 * Traduz o SQLSTATE levantado pelas funções do banco (`confirm_observation`/`report_observation`):
 * 42501 própria publicação · P0002 indisponível/expirada · 23505 já respondeu · 54000 teto diário.
 */
function translateDbError(error: unknown): unknown {
  if (!(error instanceof DbError)) return error;
  switch (error.code) {
    case "42501":
      // 42501 também é "permissão negada" do Postgres (ex.: EXECUTE revogado): só a mensagem da
      // função SQL ("... a própria publicação") é a regra de negócio; o resto segue como erro.
      return error.message.includes("própria publicação") ? fail("own_observation") : error;
    case "P0002":
      return fail("observation_unavailable");
    case "23505":
      return fail("already_done");
    case "54000":
      return fail("daily_limit");
    default:
      return error;
  }
}

const ORIGIN_BY_SOURCE: Record<FeedRow["source"], FeedOrigin> = {
  label_photo: "community",
  flyer: "flyer",
  store_panel: "store",
  manual: "team",
  receipt: "team",
};

/** Selo que a tela mostra, decidido aqui para o front só apresentar. */
function trustOf(row: FeedRow): FeedTrust {
  if (row.source === "store_panel" || row.approvedVia === "store") return "official";
  return row.status === "approved" ? "confirmed" : "unconfirmed";
}

function toFeedItem(row: FeedRow): FeedItem {
  return {
    id: row.id,
    createdAt: row.createdAt,
    store: { id: row.storeId, name: row.storeName, neighborhood: row.storeNeighborhood },
    distanceM: row.distanceM,
    product: {
      id: row.productId,
      name: row.productName,
      brand: row.brand,
      sizeValue: row.sizeValue,
      sizeUnit: row.sizeUnit,
      baseUnit: row.baseUnit,
    },
    priceCents: row.priceCents,
    unitPriceCents: row.unitPriceCents,
    promo: row.promo,
    validTo: row.validTo,
    origin: ORIGIN_BY_SOURCE[row.source],
    trust: trustOf(row),
    confirmCount: row.confirmCount,
    changedCount: row.changedCount,
    hasPhoto: row.hasPhoto,
    author: {
      label: row.authorLabel,
      level: row.authorLevel === null ? null : Math.min(3, Math.max(0, row.authorLevel)),
    },
    isMine: row.isMine,
    myVerdict: row.myVerdict,
  };
}

/**
 * Casos de uso da comunidade. A decisão de corroboração (quando um preço vira "confirmado") e os
 * tetos de abuso vivem no banco, porque quem fala direto com o PostgREST não passa por aqui;
 * este serviço só orquestra, mede a próxima página e traduz erros para códigos estáveis.
 */
export function createCommunityService(repository: CommunityRepository): CommunityService {
  return {
    async feed({ cursor, limit, ...filter }) {
      const after = cursor === undefined ? undefined : decodeFeedCursor(cursor);
      if (after === null) throw fail("invalid_cursor");

      // Pede uma a mais para saber se há próxima página sem uma segunda consulta.
      const rows = await repository.listFeed({
        ...filter,
        ...(after ? { after } : {}),
        limit: limit + 1,
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const nextCursor =
        rows.length > limit && last
          ? encodeFeedCursor({ createdAt: last.createdAt, id: last.id })
          : null;
      return { items: page.map(toFeedItem), nextCursor };
    },

    async confirm(observationId, verdict) {
      try {
        return await repository.confirm(observationId, verdict);
      } catch (error) {
        throw translateDbError(error);
      }
    },

    async report(observationId, reason) {
      try {
        await repository.report(observationId, reason);
      } catch (error) {
        throw translateDbError(error);
      }
    },

    async getPhoto(observationId) {
      const path = await repository.photoPath(observationId);
      return path ? repository.downloadPhoto(path) : null;
    },

    async reputation(userId) {
      const record = await repository.reputation(userId, REPUTATION_EVENTS_SHOWN);
      return {
        points: record.points,
        level: reputationLevel(record.points),
        nextLevelAt: nextLevelAt(record.points),
        events: record.events,
      };
    },
  };
}
