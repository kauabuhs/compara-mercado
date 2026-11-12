import type { PricePoint } from "@contracts";
import { describe, expect, it } from "vitest";
import {
  buildSeries,
  DAY_MS,
  dayStart,
  linearScale,
  niceScale,
  stepPath,
  summarize,
  timeTicks,
  valueAt,
} from "../price-history";

const STORE_A = "00000000-0000-4000-8000-00000000000a";
const STORE_B = "00000000-0000-4000-8000-00000000000b";
const NOW = new Date("2026-11-11T15:00:00-03:00");
const TODAY = dayStart(NOW);

/** Observação `daysAgo` dias antes de hoje, ao meio-dia em Brasília. */
function point(
  storeId: string,
  daysAgo: number,
  unitPriceCents: number,
  promo = false,
): PricePoint {
  const observedAt = new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString();
  return { storeId, priceCents: unitPriceCents, unitPriceCents, promo, observedAt };
}

const allStores = { storeId: null, days: 90, now: NOW };

describe("dayStart", () => {
  it("usa o dia de Brasília, não o de UTC", () => {
    // 23:30 em Brasília de 10/11 já é 11/11 em UTC
    expect(dayStart("2026-11-10T23:30:00-03:00")).toBe(Date.UTC(2026, 10, 10));
    expect(dayStart("2026-11-11T02:00:00-03:00")).toBe(Date.UTC(2026, 10, 11));
  });

  it("data inválida vira NaN", () => {
    expect(dayStart("não é data")).toBeNaN();
  });
});

describe("buildSeries", () => {
  it("sem pontos, série vazia", () => {
    expect(buildSeries([], allStores)).toEqual([]);
  });

  it("estende o último preço até hoje (degrau em vigor)", () => {
    const series = buildSeries([point(STORE_A, 10, 500)], allStores);
    expect(series.map((step) => step.t)).toEqual([TODAY - 10 * DAY_MS, TODAY]);
    expect(series.every((step) => step.unitPriceCents === 500)).toBe(true);
  });

  it("todos os mercados: menor preço VIGENTE, carregando o último preço de cada um", () => {
    const series = buildSeries(
      [
        point(STORE_A, 20, 1000), // A: 10,00
        point(STORE_B, 10, 800), //  B entra mais barato
        point(STORE_A, 5, 700), //   A cai abaixo de B
      ],
      allStores,
    );
    expect(series.map((step) => [step.t, step.unitPriceCents, step.storeId])).toEqual([
      [TODAY - 20 * DAY_MS, 1000, STORE_A],
      [TODAY - 10 * DAY_MS, 800, STORE_B],
      [TODAY - 5 * DAY_MS, 700, STORE_A],
      [TODAY, 700, STORE_A],
    ]);
  });

  it("um dia em que só o mercado caro foi observado NÃO vira uma alta falsa", () => {
    const series = buildSeries(
      [point(STORE_A, 10, 500), point(STORE_B, 10, 900), point(STORE_B, 3, 950)],
      allStores,
    );
    // o menor continua sendo o de A (500), que segue vigente
    expect(series.every((step) => step.unitPriceCents === 500)).toBe(true);
  });

  it("filtra por mercado", () => {
    const series = buildSeries([point(STORE_A, 10, 500), point(STORE_B, 8, 300)], {
      ...allStores,
      storeId: STORE_B,
    });
    expect(series[0]?.unitPriceCents).toBe(300);
    expect(series).toHaveLength(2);
  });

  it("mercado sem registros devolve série vazia", () => {
    expect(buildSeries([point(STORE_A, 10, 500)], { ...allStores, storeId: STORE_B })).toEqual([]);
  });

  it("recorta na janela mantendo o preço que já valia no início dela", () => {
    const series = buildSeries([point(STORE_A, 60, 1000), point(STORE_A, 10, 800)], {
      storeId: null,
      days: 30,
      now: NOW,
    });
    expect(series[0]).toMatchObject({ t: TODAY - 30 * DAY_MS, unitPriceCents: 1000 });
    expect(series[1]).toMatchObject({ t: TODAY - 10 * DAY_MS, unitPriceCents: 800 });
  });

  it("dentro do mesmo dia vale a observação mais recente", () => {
    const early: PricePoint = {
      ...point(STORE_A, 5, 900),
      observedAt: "2026-11-06T08:00:00-03:00",
    };
    const late: PricePoint = { ...point(STORE_A, 5, 700), observedAt: "2026-11-06T18:00:00-03:00" };
    const series = buildSeries([late, early], allStores);
    expect(series[0]?.unitPriceCents).toBe(700);
  });

  it("ignora datas inválidas e observações no futuro", () => {
    const broken: PricePoint = { ...point(STORE_A, 5, 100), observedAt: "xx" };
    const future = point(STORE_A, -3, 1);
    expect(buildSeries([broken, future], allStores)).toEqual([]);
  });

  it("não repete degraus idênticos", () => {
    const series = buildSeries(
      [point(STORE_A, 20, 500), point(STORE_A, 15, 500), point(STORE_A, 10, 500)],
      allStores,
    );
    expect(series).toHaveLength(2); // o degrau inicial + hoje
  });

  it("marca promoção", () => {
    const series = buildSeries([point(STORE_A, 5, 400, true)], allStores);
    expect(series[0]?.promo).toBe(true);
  });
});

describe("summarize", () => {
  it("queda: variação, menor e maior preço", () => {
    const summary = summarize(
      buildSeries(
        [point(STORE_A, 30, 1000), point(STORE_A, 15, 700), point(STORE_A, 5, 900)],
        allStores,
      ),
    );
    expect(summary).toMatchObject({ changeCents: -100, changePercent: -10, trend: "down" });
    expect(summary?.lowest.unitPriceCents).toBe(700);
    expect(summary?.highest.unitPriceCents).toBe(1000);
    expect(summary?.latest.unitPriceCents).toBe(900);
  });

  it("alta e preço estável", () => {
    expect(
      summarize(buildSeries([point(STORE_A, 9, 500), point(STORE_A, 3, 600)], allStores))?.trend,
    ).toBe("up");
    expect(summarize(buildSeries([point(STORE_A, 9, 500)], allStores))?.trend).toBe("flat");
  });

  it("série vazia não tem resumo", () => {
    expect(summarize([])).toBeNull();
  });
});

describe("valueAt", () => {
  const series = buildSeries([point(STORE_A, 20, 1000), point(STORE_A, 10, 800)], allStores);

  it("devolve o degrau em vigor naquele dia", () => {
    expect(valueAt(series, TODAY - 15 * DAY_MS)?.unitPriceCents).toBe(1000);
    expect(valueAt(series, TODAY - 10 * DAY_MS)?.unitPriceCents).toBe(800);
    expect(valueAt(series, TODAY)?.unitPriceCents).toBe(800);
  });

  it("antes do primeiro degrau não há valor", () => {
    expect(valueAt(series, TODAY - 40 * DAY_MS)).toBeNull();
  });
});

describe("niceScale", () => {
  it("limites e marcas em múltiplos redondos, cobrindo os dados", () => {
    const scale = niceScale(1020, 1380);
    expect(scale.min).toBeLessThanOrEqual(1020);
    expect(scale.max).toBeGreaterThanOrEqual(1380);
    expect(scale.ticks[0]).toBe(scale.min);
    expect(scale.ticks[scale.ticks.length - 1]).toBe(scale.max);
    expect(scale.ticks.length).toBeGreaterThanOrEqual(3);
    expect(scale.ticks.length).toBeLessThanOrEqual(6);
  });

  it("série plana ganha uma faixa em volta do valor", () => {
    const scale = niceScale(500, 500);
    expect(scale.min).toBeLessThan(500);
    expect(scale.max).toBeGreaterThan(500);
  });

  it("nunca desce abaixo de zero", () => {
    expect(niceScale(5, 5).min).toBeGreaterThanOrEqual(0);
    expect(niceScale(0, 40).min).toBe(0);
  });
});

describe("timeTicks", () => {
  it("início e fim sempre presentes, espaçados igualmente", () => {
    const ticks = timeTicks(TODAY - 90 * DAY_MS, TODAY, 4);
    expect(ticks).toHaveLength(4);
    expect(ticks[0]).toBe(TODAY - 90 * DAY_MS);
    expect(ticks[3]).toBe(TODAY);
  });

  it("períodos curtos têm menos marcas, e um único dia tem uma", () => {
    expect(timeTicks(TODAY - 2 * DAY_MS, TODAY, 4)).toHaveLength(3);
    expect(timeTicks(TODAY, TODAY)).toEqual([TODAY]);
  });
});

describe("linearScale e stepPath", () => {
  it("mapeia o domínio no intervalo, inclusive invertido (eixo Y do SVG)", () => {
    const y = linearScale([0, 100], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(100)).toBe(0);
    expect(y(50)).toBe(100);
  });

  it("domínio de tamanho zero cai no meio", () => {
    expect(linearScale([5, 5], [0, 10])(5)).toBe(5);
  });

  it("monta degraus: horizontal até o próximo dia e só então vertical", () => {
    const series = [
      { t: 0, unitPriceCents: 100, promo: false, storeId: STORE_A },
      { t: 10, unitPriceCents: 50, promo: false, storeId: STORE_A },
      { t: 20, unitPriceCents: 50, promo: false, storeId: STORE_A },
    ];
    const path = stepPath(series, linearScale([0, 20], [0, 200]), linearScale([0, 100], [100, 0]));
    expect(path).toBe("M0.0,0.0 H100.0 V50.0 H200.0 V50.0");
  });
});
