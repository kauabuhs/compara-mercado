import type { Profile, SessionUser, UpdateProfileRequest } from "../../contracts";

/** Códigos estáveis dos erros de negócio do perfil (o controller os traduz para HTTP). */
export type ProfileErrorCode =
  /** O telefone não é um número válido (nem no formato brasileiro nem internacional). */
  | "invalid_phone"
  /** A cidade não existe na biblioteca de cidades (ADR-0014). */
  | "invalid_city"
  /** O apelido público já é de outra pessoa ou usa um nome reservado (equipe, admin…). */
  | "nickname_unavailable"
  /** O perfil do usuário não existe (não deveria acontecer: é criado no cadastro). */
  | "profile_not_found";

/** O que o banco guarda do perfil; o e-mail vem da sessão (Supabase Auth), não desta tabela. */
export type ProfileRecord = Omit<Profile, "email">;

/** Campos que o usuário pode alterar, já normalizados (nomes de coluna ficam no repositório). */
export interface ProfilePatch {
  displayName?: string | null;
  publicNickname?: string | null;
  phone?: string | null;
  cityId?: string | null;
}

/** Porta do módulo, amarrada ao token do usuário (a RLS enxerga o próprio usuário). */
export interface ProfileService {
  get(user: Pick<SessionUser, "id" | "email">): Promise<Profile>;
  /** Edição parcial. Lança `DomainError` com `ProfileErrorCode`. */
  update(user: Pick<SessionUser, "id" | "email">, input: UpdateProfileRequest): Promise<Profile>;
}

export type ProfileServiceFactory = (accessToken: string) => ProfileService;

/** Acesso a dados do módulo: a única camada que conhece a tabela `profiles`. */
export interface ProfileRepository {
  find(userId: string): Promise<ProfileRecord | null>;
  /** `null` quando a RLS não deixa ver/alterar a linha ou ela não existe. */
  update(userId: string, patch: ProfilePatch): Promise<ProfileRecord | null>;
  /** A cidade existe na biblioteca (habilitada ou não: "em breve" também pode ser escolhida). */
  cityExists(cityId: string): Promise<boolean>;
}
