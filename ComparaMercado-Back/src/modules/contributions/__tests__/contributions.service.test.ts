import { describe, expect, it, vi } from "vitest";
import { DbError } from "../../../database/errors";
import { DomainError } from "../../../lib/domain-error";
import type { ContributionRepository, SubmitContributionInput } from "../contributions.types";
import {
  createContributionService,
  DAILY_CONTRIBUTION_LIMIT,
} from "../service/contributions.service";
import { buildJpeg, containsText, SOS_HEADER, segment, text } from "./jpeg-fixtures";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const STORE_ID = "0a7a3c3e-3f19-4a53-8d44-3c0f5d6d9a01";
const PRODUCT_ID = "6f1b1b0e-5b0e-4b7a-9d57-2d6f6c2a7e11";
const NOW = new Date("2026-11-12T12:00:00Z");

/** Fotos diferentes entre si (dados comprimidos distintos → sha256 distinto). */
const photo = (seed: number, extraPrefix: number[] = []) =>
  buildJpeg({ prefix: extraPrefix, scan: [...SOS_HEADER, 0x10 + seed, 0x20, 0x30] });

const input = (overrides: Partial<SubmitContributionInput> = {}): SubmitContributionInput => ({
  storeId: STORE_ID,
  productId: PRODUCT_ID,
  priceCents: 599,
  promo: false,
  photo: photo(1),
  ...overrides,
});

/** Repositório em memória que imita as regras do banco (hash único global, fonte por usuário). */
function createMemoryRepository(options: { targetsActive?: boolean } = {}) {
  const objects = new Map<string, Uint8Array>();
  const sources: { id: string; userId: string; sha256: string; path: string; createdAt: Date }[] =
    [];
  const observations: { id: string; sourceId: string; userId: string; priceCents: number }[] = [];
  let nextId = 0;
  const id = (prefix: string) => `${prefix}-${++nextId}`;

  const repository: ContributionRepository = {
    targetsAreActive: vi.fn(async () => options.targetsActive ?? true),
    countSourcesSince: vi.fn(
      async (userId, sinceIso) =>
        sources.filter((s) => s.userId === userId && s.createdAt >= new Date(sinceIso)).length,
    ),
    findOwnSource: vi.fn(async (userId, sha256) => {
      const own = sources.find((s) => s.userId === userId && s.sha256 === sha256);
      return own
        ? { id: own.id, hasObservation: observations.some((o) => o.sourceId === own.id) }
        : null;
    }),
    uploadPhoto: vi.fn(async (path, bytes) => {
      objects.set(path, bytes);
    }),
    insertSource: vi.fn(async ({ userId, sha256, path }) => {
      if (sources.some((s) => s.sha256 === sha256)) throw new DbError("duplicate", "23505");
      const source = { id: id("src"), userId, sha256, path, createdAt: NOW };
      sources.push(source);
      return source.id;
    }),
    insertObservation: vi.fn(async ({ userId, sourceId, priceCents }) => {
      const observation = { id: id("obs"), sourceId, userId, priceCents };
      observations.push(observation);
      return observation.id;
    }),
    listMine: vi.fn(async () => ({ items: [], total: 0 })),
  };
  return { repository, objects, sources, observations };
}

function createService(memory = createMemoryRepository()) {
  return createContributionService(memory.repository, {
    now: () => NOW,
    newId: (() => {
      let counter = 0;
      return () => `file-${++counter}`;
    })(),
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof DomainError ? error.code : `erro inesperado: ${String(error)}`;
  }
}

describe("envio de preço com foto", () => {
  it("guarda a foto na pasta do usuário e cria o envio pendente", async () => {
    const memory = createMemoryRepository();
    const result = await createService(memory).submit(USER_ID, input());

    expect(result).toEqual({ id: "obs-2", status: "pending" });
    expect([...memory.objects.keys()]).toEqual([`${USER_ID}/file-1.jpg`]);
    expect(memory.sources[0]).toMatchObject({ userId: USER_ID, path: `${USER_ID}/file-1.jpg` });
    expect(memory.observations[0]).toMatchObject({ userId: USER_ID, priceCents: 599 });
    expect(memory.repository.insertObservation).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: memory.sources[0]?.id, storeId: STORE_ID }),
    );
  });

  it("nunca guarda metadados da foto (EXIF/GPS) nem o que vem depois do fim da imagem", async () => {
    const memory = createMemoryRepository();
    const exif = segment(0xe1, [...text("Exif\0\0"), ...text("GPSLatitude=-29.17")]);
    const withExif = Uint8Array.from([...photo(1, exif), ...text("<?php evil ?>")]);
    await createService(memory).submit(USER_ID, input({ photo: withExif }));

    const stored = [...memory.objects.values()][0];
    expect(stored).toBeDefined();
    if (!stored) return;
    expect(containsText(stored, "GPSLatitude")).toBe(false);
    expect(containsText(stored, "evil")).toBe(false);
    expect(containsText(withExif, "GPSLatitude")).toBe(true);
  });

  it("recusa foto inválida sem tocar no armazenamento nem no banco", async () => {
    const memory = createMemoryRepository();
    const service = createService(memory);
    const notJpeg = Uint8Array.from(text("isto não é uma foto"));
    expect(await codeOf(service.submit(USER_ID, input({ photo: notJpeg })))).toBe("invalid_photo");
    expect(await codeOf(service.submit(USER_ID, input({ photo: photo(1).subarray(0, 30) })))).toBe(
      "invalid_photo",
    );
    expect(memory.repository.targetsAreActive).not.toHaveBeenCalled();
    expect(memory.repository.uploadPhoto).not.toHaveBeenCalled();
    expect(memory.sources).toHaveLength(0);
  });

  it("recusa mercado ou produto inativo antes de gravar qualquer arquivo", async () => {
    const memory = createMemoryRepository({ targetsActive: false });
    expect(await codeOf(createService(memory).submit(USER_ID, input()))).toBe("invalid_target");
    expect(memory.repository.uploadPhoto).not.toHaveBeenCalled();
  });

  it("barra o envio acima do teto diário antes de gravar arquivo", async () => {
    const memory = createMemoryRepository();
    const service = createService(memory);
    for (let seed = 0; seed < DAILY_CONTRIBUTION_LIMIT; seed++) {
      await service.submit(USER_ID, input({ photo: photo(seed) }));
    }
    const uploadsBefore = memory.objects.size;
    expect(await codeOf(service.submit(USER_ID, input({ photo: photo(200) })))).toBe("daily_limit");
    expect(memory.objects.size).toBe(uploadsBefore);
    // o teto é por usuário
    expect(await codeOf(service.submit(OTHER_USER_ID, input({ photo: photo(201) })))).toBe(
      undefined,
    );
  });

  it("recusa a mesma foto reenviada pelo mesmo usuário", async () => {
    const service = createService();
    await service.submit(USER_ID, input());
    expect(await codeOf(service.submit(USER_ID, input()))).toBe("duplicate_photo");
  });

  it("recusa foto já enviada por OUTRO usuário (hash único) sem revelar quem", async () => {
    const memory = createMemoryRepository();
    const service = createService(memory);
    await service.submit(OTHER_USER_ID, input());
    const error = await createService(memory)
      .submit(USER_ID, input())
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe("duplicate_photo");
    expect((error as DomainError).message).not.toContain(OTHER_USER_ID);
    expect(memory.observations).toHaveLength(1);
  });

  it("retoma um envio que parou depois de guardar a foto (sem duplicar arquivo nem fonte)", async () => {
    const memory = createMemoryRepository();
    const service = createService(memory);
    const insertObservation = vi.mocked(memory.repository.insertObservation);
    insertObservation.mockRejectedValueOnce(new DbError("rede caiu", "08006"));

    await expect(service.submit(USER_ID, input())).rejects.toBeInstanceOf(DbError);
    expect(memory.sources).toHaveLength(1);
    expect(memory.observations).toHaveLength(0);

    // o usuário tenta de novo com a mesma foto: aproveita a fonte que já existe
    const retry = await service.submit(USER_ID, input());
    expect(retry.status).toBe("pending");
    expect(memory.sources).toHaveLength(1);
    expect(memory.objects.size).toBe(1);
    expect(memory.observations).toHaveLength(1);
  });

  it("traduz os erros do banco em erros de negócio e repassa os inesperados", async () => {
    const cases: [string, string][] = [
      ["54000", "daily_limit"],
      ["42501", "invalid_target"],
      ["23503", "invalid_target"],
    ];
    for (const [sqlState, expected] of cases) {
      const memory = createMemoryRepository();
      vi.mocked(memory.repository.insertObservation).mockRejectedValueOnce(
        new DbError("falhou", sqlState),
      );
      expect(await codeOf(createService(memory).submit(USER_ID, input()))).toBe(expected);
    }

    const memory = createMemoryRepository();
    vi.mocked(memory.repository.insertObservation).mockRejectedValueOnce(
      new DbError("timeout", "57014"),
    );
    await expect(createService(memory).submit(USER_ID, input())).rejects.toBeInstanceOf(DbError);
  });
});
