import { describe, expect, it, vi } from "vitest";
import { CommunityFeedQuerySchema, FEED_PAGE_SIZE_MAX } from "../../../contracts";
import { DbError } from "../../../database/errors";
import { decodeFeedCursor, encodeFeedCursor } from "../../../lib/cursor";
import { DomainError } from "../../../lib/domain-error";
import type { CommunityRepository, FeedRow } from "../community.types";
import { createCommunityService } from "../service/community.service";

const CITY_ID = "5e8f4f1c-1b1a-4c8a-9b0e-7b1f0a9d3c01";

function row(overrides: Partial<FeedRow> = {}): FeedRow {
  return {
    id: "9d1c1e0a-7f0c-4b0e-8f4e-5d3d2d0a1b01",
    createdAt: "2026-11-13T12:00:00+00:00",
    storeId: "0a7a3c3e-3f19-4a53-8d44-3c0f5d6d9a01",
    storeName: "Mercado Teste",
    storeNeighborhood: "Centro",
    distanceM: null,
    productId: "6f1b1b0e-5b0e-4b7a-9d57-2d6f6c2a7e11",
    productName: "Arroz 1kg",
    brand: null,
    sizeValue: 1,
    sizeUnit: "kg",
    baseUnit: "kg",
    priceCents: 599,
    unitPriceCents: 599,
    promo: false,
    validTo: null,
    source: "label_photo",
    status: "pending",
    approvedVia: null,
    confirmCount: 0,
    changedCount: 0,
    hasPhoto: true,
    authorLabel: "Colaborador #A1B2",
    authorLevel: 0,
    isMine: false,
    myVerdict: null,
    ...overrides,
  };
}

function repo(overrides: Partial<CommunityRepository> = {}): CommunityRepository {
  return {
    listFeed: vi.fn().mockResolvedValue([]),
    confirm: vi.fn().mockResolvedValue({ status: "pending", confirmCount: 1, changedCount: 0 }),
    report: vi.fn().mockResolvedValue(undefined),
    photoPath: vi.fn().mockResolvedValue(null),
    downloadPhoto: vi.fn().mockResolvedValue(null),
    reputation: vi.fn().mockResolvedValue({ points: 0, events: [] }),
    ...overrides,
  };
}

const baseFilter = { cityId: CITY_ID, promoOnly: false, limit: 2 };

describe("feed", () => {
  it("pede uma linha a mais para saber se há próxima página e devolve o cursor da última entregue", async () => {
    const rows = [
      row({ id: "9d1c1e0a-7f0c-4b0e-8f4e-5d3d2d0a1b03", createdAt: "2026-11-13T12:03:00+00:00" }),
      row({ id: "9d1c1e0a-7f0c-4b0e-8f4e-5d3d2d0a1b02", createdAt: "2026-11-13T12:02:00+00:00" }),
      row({ id: "9d1c1e0a-7f0c-4b0e-8f4e-5d3d2d0a1b01", createdAt: "2026-11-13T12:01:00+00:00" }),
    ];
    const repository = repo({ listFeed: vi.fn().mockResolvedValue(rows) });
    const page = await createCommunityService(repository).feed(baseFilter);

    expect(vi.mocked(repository.listFeed).mock.calls[0]?.[0].limit).toBe(3);
    expect(page.items.map((item) => item.id)).toEqual([rows[0]?.id, rows[1]?.id]);
    expect(decodeFeedCursor(page.nextCursor ?? "")).toEqual({
      createdAt: "2026-11-13T12:02:00+00:00",
      id: "9d1c1e0a-7f0c-4b0e-8f4e-5d3d2d0a1b02",
    });
  });

  it("no maior limite permitido ainda dá para saber se há próxima página", () => {
    // A função SQL devolve no máximo 50 linhas; o serviço pede `limit + 1`.
    expect(FEED_PAGE_SIZE_MAX + 1).toBeLessThanOrEqual(50);
    const query = (limit: number) => CommunityFeedQuerySchema.safeParse({ cityId: CITY_ID, limit });
    expect(query(FEED_PAGE_SIZE_MAX).success).toBe(true);
    expect(query(FEED_PAGE_SIZE_MAX + 1).success).toBe(false);
  });

  it("latitude e longitude vazias contam como ausentes (não viram 0,0)", () => {
    const parsed = CommunityFeedQuerySchema.parse({ cityId: CITY_ID, lat: "", lng: "" });
    expect(parsed.lat).toBeUndefined();
    expect(parsed.lng).toBeUndefined();
  });

  it("na última página não devolve cursor", async () => {
    const repository = repo({ listFeed: vi.fn().mockResolvedValue([row()]) });
    const page = await createCommunityService(repository).feed(baseFilter);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  it("repassa o cursor decodificado ao repositório", async () => {
    const after = {
      createdAt: "2026-11-13T12:00:00+00:00",
      id: "9d1c1e0a-7f0c-4b0e-8f4e-5d3d2d0a1b09",
    };
    const repository = repo();
    await createCommunityService(repository).feed({
      ...baseFilter,
      cursor: encodeFeedCursor(after),
    });
    expect(vi.mocked(repository.listFeed).mock.calls[0]?.[0].after).toEqual(after);
  });

  it("cursor inválido falha antes de consultar o banco", async () => {
    const repository = repo();
    await expect(
      createCommunityService(repository).feed({ ...baseFilter, cursor: "lixo" }),
    ).rejects.toMatchObject({ code: "invalid_cursor" });
    expect(repository.listFeed).not.toHaveBeenCalled();
  });

  it.each([
    ["encarte da IA aprovado", { source: "flyer", status: "approved" }, "flyer", "confirmed"],
    [
      "comunidade ainda pendente",
      { source: "label_photo", status: "pending" },
      "community",
      "unconfirmed",
    ],
    [
      "comunidade aprovada por corroboração",
      { source: "label_photo", status: "approved", approvedVia: "community" },
      "community",
      "confirmed",
    ],
    [
      "publicado pelo mercado",
      { source: "store_panel", status: "approved", approvedVia: "store" },
      "store",
      "official",
    ],
    ["lançado pela equipe", { source: "manual", status: "approved" }, "team", "confirmed"],
  ] as const)("origem e selo: %s", async (_label, fields, origin, trust) => {
    const repository = repo({ listFeed: vi.fn().mockResolvedValue([row({ ...fields })]) });
    const [item] = (await createCommunityService(repository).feed(baseFilter)).items;
    expect(item).toMatchObject({ origin, trust });
  });

  it("não vaza identidade: só apelido e nível do autor (nível limitado a 0–3)", async () => {
    const repository = repo({ listFeed: vi.fn().mockResolvedValue([row({ authorLevel: 7 })]) });
    const [item] = (await createCommunityService(repository).feed(baseFilter)).items;
    expect(item?.author).toEqual({ label: "Colaborador #A1B2", level: 3 });
    expect(JSON.stringify(item)).not.toMatch(/user|email|phone|created_by/i);
  });
});

describe("confirmar e denunciar", () => {
  it.each([
    [
      "42501",
      "community.confirm: não é possível confirmar a própria publicação",
      "own_observation",
    ],
    ["P0002", "falhou", "observation_unavailable"],
    ["23505", "falhou", "already_done"],
    ["54000", "falhou", "daily_limit"],
  ])("SQLSTATE %s vira o código de negócio %s", async (sqlstate, message, code) => {
    const failing = vi.fn().mockRejectedValue(new DbError(message, sqlstate));
    const service = createCommunityService(repo({ confirm: failing, report: failing }));
    await expect(service.confirm("id", "confirm")).rejects.toMatchObject({ code });
    await expect(service.report("id", "spam")).rejects.toBeInstanceOf(DomainError);
  });

  it("permissão negada do Postgres (42501 sem ser a regra da própria publicação) segue como erro", async () => {
    const failing = vi
      .fn()
      .mockRejectedValue(
        new DbError("permission denied for function confirm_observation", "42501"),
      );
    const service = createCommunityService(repo({ confirm: failing }));
    await expect(service.confirm("id", "confirm")).rejects.toBeInstanceOf(DbError);
  });

  it("erro de dados desconhecido segue como está (vira 502 na API)", async () => {
    const failing = vi.fn().mockRejectedValue(new DbError("timeout", "57014"));
    const service = createCommunityService(repo({ confirm: failing }));
    await expect(service.confirm("id", "confirm")).rejects.toBeInstanceOf(DbError);
  });

  it("devolve o resultado do banco (inclusive a aprovação)", async () => {
    const repository = repo({
      confirm: vi.fn().mockResolvedValue({ status: "approved", confirmCount: 2, changedCount: 0 }),
    });
    await expect(createCommunityService(repository).confirm("id", "confirm")).resolves.toEqual({
      status: "approved",
      confirmCount: 2,
      changedCount: 0,
    });
  });
});

describe("foto", () => {
  it("sem caminho visível não baixa nada", async () => {
    const repository = repo();
    expect(await createCommunityService(repository).getPhoto("id")).toBeNull();
    expect(repository.downloadPhoto).not.toHaveBeenCalled();
  });

  it("baixa o arquivo do caminho informado pelo banco", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const repository = repo({
      photoPath: vi.fn().mockResolvedValue("u/a.jpg"),
      downloadPhoto: vi.fn().mockResolvedValue(bytes),
    });
    expect(await createCommunityService(repository).getPhoto("id")).toBe(bytes);
    expect(repository.downloadPhoto).toHaveBeenCalledWith("u/a.jpg");
  });
});

describe("reputação", () => {
  it("calcula nível e próximo limiar a partir dos pontos", async () => {
    const events = [
      { kind: "price_approved" as const, points: 10, createdAt: "2026-11-13T12:00:00Z" },
    ];
    const repository = repo({ reputation: vi.fn().mockResolvedValue({ points: 60, events }) });
    expect(await createCommunityService(repository).reputation("user")).toEqual({
      points: 60,
      level: 1,
      nextLevelAt: 200,
      events,
    });
  });
});
