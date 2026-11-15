import { describe, expect, it, vi } from "vitest";
import { DbError } from "../../../database/errors";
import { DomainError } from "../../../lib/domain-error";
import type { ProfileRecord, ProfileRepository } from "../profile.types";
import { createProfileService } from "../service/profile.service";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "maria@example.test" };
const CITY_ID = "5e8f4f1c-1b1a-4c8a-9b0e-7b1f0a9d3c01";

const baseRecord: ProfileRecord = {
  displayName: "Maria",
  publicNickname: null,
  phone: null,
  cityId: null,
  termsVersion: "2026-11",
  termsAcceptedAt: "2026-11-09T12:00:00Z",
  createdAt: "2026-11-09T12:00:00Z",
};

function build(overrides: Partial<ProfileRepository> = {}) {
  const repository: ProfileRepository = {
    find: vi.fn().mockResolvedValue(baseRecord),
    update: vi.fn(async (_id, patch) => ({
      ...baseRecord,
      ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
      ...(patch.publicNickname !== undefined ? { publicNickname: patch.publicNickname } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.cityId !== undefined ? { cityId: patch.cityId } : {}),
    })),
    cityExists: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
  return { repository, service: createProfileService(repository) };
}

const rejectsWith = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
};

describe("profile.service", () => {
  it("junta o e-mail da sessão aos dados do perfil", async () => {
    const { service } = build();
    expect(await service.get(USER)).toEqual({ email: USER.email, ...baseRecord });
  });

  it("falha com profile_not_found se o perfil não existe", async () => {
    const { service } = build({ find: vi.fn().mockResolvedValue(null) });
    await rejectsWith(service.get(USER), "profile_not_found");
  });

  it("grava o apelido público e o apaga com null", async () => {
    const { service, repository } = build();
    const named = await service.update(USER, { publicNickname: "Maria do Bairro" });
    expect(repository.update).toHaveBeenCalledWith(USER.id, { publicNickname: "Maria do Bairro" });
    expect(named.publicNickname).toBe("Maria do Bairro");

    const cleared = await service.update(USER, { publicNickname: null });
    expect(repository.update).toHaveBeenLastCalledWith(USER.id, { publicNickname: null });
    expect(cleared.publicNickname).toBeNull();
  });

  it("normaliza o telefone para E.164 antes de gravar", async () => {
    const { service, repository } = build();
    const profile = await service.update(USER, { phone: "(54) 99999-0000" });
    expect(repository.update).toHaveBeenCalledWith(USER.id, { phone: "+5554999990000" });
    expect(profile.phone).toBe("+5554999990000");
  });

  it("apaga o telefone com null ou texto vazio", async () => {
    const { service, repository } = build();
    await service.update(USER, { phone: null });
    await service.update(USER, { phone: "  " });
    expect(repository.update).toHaveBeenNthCalledWith(1, USER.id, { phone: null });
    expect(repository.update).toHaveBeenNthCalledWith(2, USER.id, { phone: null });
  });

  it("recusa telefone inválido sem tocar no banco", async () => {
    const { service, repository } = build();
    await rejectsWith(service.update(USER, { phone: "abc" }), "invalid_phone");
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("só envia ao repositório os campos informados", async () => {
    const { service, repository } = build();
    await service.update(USER, { displayName: "Maria S." });
    expect(repository.update).toHaveBeenCalledWith(USER.id, { displayName: "Maria S." });
  });

  it("recusa cidade inexistente", async () => {
    const { service, repository } = build({ cityExists: vi.fn().mockResolvedValue(false) });
    await rejectsWith(service.update(USER, { cityId: CITY_ID }), "invalid_city");
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("aceita limpar a cidade sem consultar o banco", async () => {
    const { service, repository } = build();
    await service.update(USER, { cityId: null });
    expect(repository.cityExists).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith(USER.id, { cityId: null });
  });

  it("traduz violação de chave estrangeira em invalid_city", async () => {
    const { service } = build({
      update: vi.fn().mockRejectedValue(new DbError("fk", "23503")),
    });
    await rejectsWith(service.update(USER, { cityId: CITY_ID }), "invalid_city");
  });

  it.each([
    [
      "23505",
      'profile.update: duplicate key value violates unique constraint "profiles_public_nickname_uq"',
    ],
    ["23514", 'profile.update: violates check constraint "profiles_public_nickname_reserved"'],
  ])(
    "apelido repetido ou reservado (SQLSTATE %s) vira nickname_unavailable",
    async (code, message) => {
      const { service } = build({ update: vi.fn().mockRejectedValue(new DbError(message, code)) });
      await rejectsWith(service.update(USER, { publicNickname: "Equipe" }), "nickname_unavailable");
    },
  );

  it("violação de outra restrição não é confundida com apelido", async () => {
    const failure = new DbError(
      'profile.update: violates check constraint "profiles_phone_e164"',
      "23514",
    );
    const { service } = build({ update: vi.fn().mockRejectedValue(failure) });
    await expect(service.update(USER, { displayName: "Maria S." })).rejects.toBe(failure);
  });

  it("deixa passar falhas de infraestrutura (viram 502 na API)", async () => {
    const failure = new DbError("conexão caiu", "08006");
    const { service } = build({ update: vi.fn().mockRejectedValue(failure) });
    await expect(service.update(USER, { displayName: "Maria S." })).rejects.toBe(failure);
  });

  it("falha com profile_not_found se a RLS não devolve a linha", async () => {
    const { service } = build({ update: vi.fn().mockResolvedValue(null) });
    await rejectsWith(service.update(USER, { displayName: "Maria S." }), "profile_not_found");
  });
});
