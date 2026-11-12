import { DbError } from "../../../database/errors";
import { DomainError } from "../../../lib/domain-error";
import type {
  ContributionErrorCode,
  ContributionRepository,
  ContributionService,
} from "../contributions.types";
import { type JpegRejection, sanitizeJpeg } from "./jpeg";

/** Igual ao teto do banco (`price_observations_before_insert`); aqui barra antes de gravar arquivo. */
export const DAILY_CONTRIBUTION_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const PHOTO_MESSAGES: Record<JpegRejection, string> = {
  not_jpeg: "A foto precisa ser uma imagem JPEG.",
  malformed: "Não foi possível ler a foto. Tire outra e tente de novo.",
  unsupported: "Esse tipo de imagem não é aceito. Tire uma foto com a câmera do celular.",
  too_small: "A foto está pequena demais para ler a etiqueta. Chegue mais perto e tente de novo.",
  too_large: "A foto é grande demais. Tire uma foto com a câmera do celular.",
};

const MESSAGES: Record<Exclude<ContributionErrorCode, "invalid_photo">, string> = {
  duplicate_photo: "Essa foto já foi enviada.",
  daily_limit: "Você atingiu o limite de envios de hoje. Volte amanhã.",
  invalid_target: "Mercado ou produto indisponível. Escolha outro e tente de novo.",
};

const fail = (code: ContributionErrorCode, message: string) => new DomainError(code, message);

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface ContributionServiceOptions {
  now?: () => Date;
  newId?: () => string;
}

/**
 * Caso de uso do envio de preço com foto (MVP): sanitiza a foto, grava no bucket privado, registra
 * a fonte e cria a observação **pendente** — o preço só aparece para o público depois que um
 * admin aprova. Nada aqui publica preço.
 */
export function createContributionService(
  repository: ContributionRepository,
  { now = () => new Date(), newId = () => crypto.randomUUID() }: ContributionServiceOptions = {},
): ContributionService {
  return {
    async submit(userId, input) {
      const photo = sanitizeJpeg(input.photo);
      if (!photo.ok) throw fail("invalid_photo", PHOTO_MESSAGES[photo.reason]);

      if (!(await repository.targetsAreActive(input.storeId, input.productId))) {
        throw fail("invalid_target", MESSAGES.invalid_target);
      }

      const since = new Date(now().getTime() - DAY_MS).toISOString();
      if ((await repository.countSourcesSince(userId, since)) >= DAILY_CONTRIBUTION_LIMIT) {
        throw fail("daily_limit", MESSAGES.daily_limit);
      }

      const sha256 = await sha256Hex(photo.bytes);
      // Reenvio da mesma foto: se uma tentativa anterior parou antes de criar o envio, retoma de
      // onde parou (a foto já está guardada); se já virou envio, é duplicata.
      const ownSource = await repository.findOwnSource(userId, sha256);
      let sourceId: string;
      if (ownSource) {
        if (ownSource.hasObservation) throw fail("duplicate_photo", MESSAGES.duplicate_photo);
        sourceId = ownSource.id;
      } else {
        const path = `${userId}/${newId()}.jpg`;
        await repository.uploadPhoto(path, photo.bytes);
        try {
          sourceId = await repository.insertSource({
            userId,
            storeId: input.storeId,
            path,
            sha256,
          });
        } catch (error) {
          // Hash único no banco: a foto já existe (provavelmente de outro usuário).
          if (error instanceof DbError && error.code === "23505") {
            throw fail("duplicate_photo", MESSAGES.duplicate_photo);
          }
          throw error;
        }
      }

      try {
        const id = await repository.insertObservation({
          userId,
          storeId: input.storeId,
          productId: input.productId,
          priceCents: input.priceCents,
          promo: input.promo,
          sourceId,
        });
        return { id, status: "pending" };
      } catch (error) {
        if (error instanceof DbError) {
          if (error.code === "54000") throw fail("daily_limit", MESSAGES.daily_limit);
          if (error.code === "42501" || error.code === "23503") {
            throw fail("invalid_target", MESSAGES.invalid_target);
          }
        }
        throw error;
      }
    },

    listMine: (userId, query) => repository.listMine(userId, query),
  };
}
