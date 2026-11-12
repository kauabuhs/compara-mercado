import type { ContributionCreated, MyContribution, MyContributionsQuery } from "../../contracts";
import type { Paged } from "../../lib/pagination";

/** Códigos estáveis dos erros de negócio do envio (o controller os traduz para HTTP). */
export type ContributionErrorCode =
  /** A foto não é um JPEG utilizável (formato, estrutura ou tamanho). */
  | "invalid_photo"
  /** Essa foto já foi enviada (por este ou por outro usuário). */
  | "duplicate_photo"
  /** Teto diário de envios atingido. */
  | "daily_limit"
  /** Mercado ou produto não existe ou não está ativo. */
  | "invalid_target";

export interface SubmitContributionInput {
  storeId: string;
  productId: string;
  priceCents: number;
  promo: boolean;
  /** Bytes da foto como recebidos; o service os sanitiza. */
  photo: Uint8Array;
}

/** Porta do módulo, amarrada ao token do usuário (a RLS enxerga o próprio usuário). */
export interface ContributionService {
  /** Registra a foto e o preço como pendente de revisão. Lança `DomainError` com `ContributionErrorCode`. */
  submit(userId: string, input: SubmitContributionInput): Promise<ContributionCreated>;
  listMine(userId: string, query: MyContributionsQuery): Promise<Paged<MyContribution>>;
}

export type ContributionServiceFactory = (accessToken: string) => ContributionService;

/** Acesso a dados do módulo: a única camada que conhece tabelas, colunas e o bucket. */
export interface ContributionRepository {
  /** Mercado e produto existem e estão ativos (a RLS já esconde os inativos). */
  targetsAreActive(storeId: string, productId: string): Promise<boolean>;
  /** Fotos registradas pelo usuário desde o instante dado (teto diário, antes de gravar arquivo). */
  countSourcesSince(userId: string, sinceIso: string): Promise<number>;
  /** Fonte do próprio usuário com esse hash, se houver, e se já virou um envio. */
  findOwnSource(
    userId: string,
    sha256: string,
  ): Promise<{ id: string; hasObservation: boolean } | null>;
  uploadPhoto(path: string, bytes: Uint8Array): Promise<void>;
  /** Lança `DbError` com `code === "23505"` se o hash já existe. */
  insertSource(input: {
    userId: string;
    storeId: string;
    path: string;
    sha256: string;
  }): Promise<string>;
  /** Lança `DbError` com o SQLSTATE (ex.: `54000` teto diário, `42501`/`23503` alvo inválido). */
  insertObservation(input: {
    userId: string;
    storeId: string;
    productId: string;
    priceCents: number;
    promo: boolean;
    sourceId: string;
  }): Promise<string>;
  listMine(userId: string, query: MyContributionsQuery): Promise<Paged<MyContribution>>;
}
