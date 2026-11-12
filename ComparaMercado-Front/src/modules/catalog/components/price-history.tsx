"use client";

import type { BaseUnit, PricePoint } from "@contracts";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useId, useMemo, useState } from "react";
import { SegmentedControl } from "@/components/ui/controls";
import { Badge, Select } from "@/components/ui/primitives";
import {
  BASE_UNIT_LABEL,
  formatAxisPrice,
  formatBRLUnit,
  formatDayMonth,
  formatLongDay,
} from "@/lib/format";
import {
  buildSeries,
  DAY_MS,
  linearScale,
  niceScale,
  type SeriesPoint,
  stepPath,
  summarize,
  timeTicks,
  valueAt,
} from "@/lib/price-history";
import { cn } from "@/lib/utils";

// O desenho usa um sistema de coordenadas fixo e escala com a largura do contêiner (viewBox).
const WIDTH = 420;
const HEIGHT = 220;
const MARGIN = { top: 14, right: 14, bottom: 28, left: 46 };
const PLOT_BOTTOM = HEIGHT - MARGIN.bottom;

type Period = "30" | "90";
const PERIOD_OPTIONS = [
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
] as const;
const ALL_STORES = "all";
const UNKNOWN_STORE = "Outro mercado";

interface PriceHistoryProps {
  /** Observações dos últimos 90 dias (o menor preço por unidade base de cada uma). */
  points: readonly PricePoint[];
  baseUnit: BaseUnit;
  /** Nome dos mercados que têm preço vigente hoje, por id (alimenta o seletor e o tooltip). */
  storeNames: Readonly<Record<string, string>>;
}

/**
 * Histórico do menor preço por unidade, em SVG puro (sem biblioteca de gráfico).
 *
 * Linha em degraus (o preço vale até mudar), eixos com datas e valores, resumo do que mudou,
 * escolha do período e do mercado, e cursor com tooltip por mouse, toque ou setas do teclado.
 * Para leitor de tela: um controle deslizante que lê cada degrau + uma tabela com os dados.
 */
export function PriceHistory({ points, baseUnit, storeNames }: PriceHistoryProps) {
  const [period, setPeriod] = useState<Period>("90");
  const [storeFilter, setStoreFilter] = useState<string>(ALL_STORES);
  const [cursorT, setCursorT] = useState<number | null>(null);
  const [now] = useState(() => new Date());
  const storeSelectId = useId();

  const storeOptions = useMemo(() => {
    const ids = new Set(points.map((point) => point.storeId));
    return [...ids]
      .flatMap((id) => {
        const name = storeNames[id];
        return name ? [{ id, name }] : [];
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [points, storeNames]);

  const series = useMemo(
    () =>
      buildSeries(points, {
        storeId: storeFilter === ALL_STORES ? null : storeFilter,
        days: Number(period),
        now,
      }),
    [points, storeFilter, period, now],
  );
  const summary = summarize(series);

  const unitLabel = BASE_UNIT_LABEL[baseUnit];
  const nameOf = (storeId: string) => storeNames[storeId] ?? UNKNOWN_STORE;
  const priceLabel = (point: SeriesPoint) => formatBRLUnit(point.unitPriceCents, baseUnit);
  const describePoint = (point: SeriesPoint) =>
    [
      `${formatLongDay(point.t)}: ${priceLabel(point)}`,
      point.promo ? "em oferta" : null,
      nameOf(point.storeId),
    ]
      .filter(Boolean)
      .join(", ");

  return (
    <figure className="space-y-4">
      <figcaption className="sr-only">
        Histórico do menor preço por {unitLabel}
        {storeFilter === ALL_STORES ? " entre os mercados" : ` em ${nameOf(storeFilter)}`}.
      </figcaption>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          label="Período do histórico"
          value={period}
          options={PERIOD_OPTIONS}
          onChange={(value) => {
            setPeriod(value);
            setCursorT(null);
          }}
          className="sm:w-56"
        />
        {storeOptions.length > 1 ? (
          <div className="sm:w-60">
            <label htmlFor={storeSelectId} className="sr-only">
              Mercado
            </label>
            <Select
              id={storeSelectId}
              value={storeFilter}
              onChange={(event) => {
                setStoreFilter(event.target.value);
                setCursorT(null);
              }}
              className="h-11 rounded-full pl-5"
            >
              <option value={ALL_STORES}>Todos os mercados</option>
              {storeOptions.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>

      {summary === null ? (
        <p className="rounded-2xl bg-fill px-4 py-6 text-center text-muted-foreground">
          Sem registros deste mercado nos últimos {period} dias.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            <p className="type-caption">
              {storeFilter === ALL_STORES ? "Menor preço hoje" : "Preço hoje"} ·{" "}
              {nameOf(summary.latest.storeId)}
            </p>
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-3xl font-semibold tabular-nums">
                {priceLabel(summary.latest)}
              </span>
              <TrendBadge summary={summary} />
            </p>
          </div>

          {series.length >= 2 ? (
            <Chart
              series={series}
              baseUnit={baseUnit}
              cursorT={cursorT}
              onCursorChange={setCursorT}
              describePoint={describePoint}
              nameOf={nameOf}
            />
          ) : (
            <p className="rounded-2xl bg-fill px-4 py-6 text-center text-muted-foreground">
              Ainda sem variação de preço neste período.
            </p>
          )}

          <dl className="grid grid-cols-2 gap-3">
            <Extreme
              label="Menor preço"
              point={summary.lowest}
              priceLabel={priceLabel(summary.lowest)}
              storeName={nameOf(summary.lowest.storeId)}
              emphasis
            />
            <Extreme
              label="Maior preço"
              point={summary.highest}
              priceLabel={priceLabel(summary.highest)}
              storeName={nameOf(summary.highest.storeId)}
            />
          </dl>

          <details className="group rounded-2xl bg-fill">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium">
              Ver os dados em tabela
            </summary>
            <div className="overflow-x-auto px-4 pb-4">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Mudanças do menor preço por {unitLabel}</caption>
                <thead className="text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      A partir de
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Preço
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Mercado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-separator">
                  {series.map((point) => (
                    <tr key={point.t}>
                      <th scope="row" className="py-2 pr-3 font-normal whitespace-nowrap">
                        {formatLongDay(point.t)}
                      </th>
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                        {priceLabel(point)}
                        {point.promo ? " (oferta)" : ""}
                      </td>
                      <td className="py-2">{nameOf(point.storeId)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </figure>
  );
}

function TrendBadge({ summary }: { summary: NonNullable<ReturnType<typeof summarize>> }) {
  const since = formatDayMonth(summary.first.t);
  if (summary.first.t === summary.latest.t) return <Badge>sem variação no período</Badge>;
  if (summary.trend === "flat") {
    return (
      <Badge>
        <Minus aria-hidden className="size-3" /> Estável desde {since}
      </Badge>
    );
  }
  const percent = Math.abs(summary.changePercent);
  // Mostra "menos de 1%" em vez de "0%" quando o preço mudou, mas pouco.
  const amount = percent === 0 ? "menos de 1%" : `${percent}%`;
  return summary.trend === "down" ? (
    <Badge tone="success">
      <ArrowDown aria-hidden className="size-3" /> Caiu {amount} desde {since}
    </Badge>
  ) : (
    <Badge tone="warning">
      <ArrowUp aria-hidden className="size-3" /> Subiu {amount} desde {since}
    </Badge>
  );
}

function Extreme({
  label,
  point,
  priceLabel,
  storeName,
  emphasis = false,
}: {
  label: string;
  point: SeriesPoint;
  priceLabel: string;
  storeName: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn("space-y-0.5 rounded-2xl px-3 py-2.5", emphasis ? "bg-brand-soft" : "bg-fill")}
    >
      <dt className="type-caption">{label}</dt>
      <dd className="font-semibold tabular-nums">{priceLabel}</dd>
      <dd className="type-caption truncate">
        {formatDayMonth(point.t)} · {storeName}
      </dd>
    </div>
  );
}

interface ChartProps {
  series: readonly SeriesPoint[];
  baseUnit: BaseUnit;
  cursorT: number | null;
  onCursorChange: (t: number | null) => void;
  describePoint: (point: SeriesPoint) => string;
  nameOf: (storeId: string) => string;
}

function Chart({ series, baseUnit, cursorT, onCursorChange, describePoint, nameOf }: ChartProps) {
  const first = series[0];
  const last = series[series.length - 1];
  if (!first || !last) return null;
  const startT = first.t;
  const endT = last.t;

  const prices = series.map((point) => point.unitPriceCents);
  const scale = niceScale(Math.min(...prices), Math.max(...prices));
  const x = linearScale([startT, endT], [MARGIN.left, WIDTH - MARGIN.right]);
  const y = linearScale([scale.min, scale.max], [PLOT_BOTTOM, MARGIN.top]);

  const line = stepPath(series, x, y);
  const area = `${line} V${PLOT_BOTTOM} H${x(startT).toFixed(1)} Z`;
  const xTicks = timeTicks(startT, endT);
  const promoSteps = series.filter((point) => point.promo);

  const activeIndex = (() => {
    const point = valueAt(series, cursorT ?? endT);
    return Math.max(0, point ? series.indexOf(point) : series.length - 1);
  })();
  const activePoint = series[activeIndex] ?? last;
  const cursorX = cursorT === null ? null : x(Math.min(Math.max(cursorT, startT), endT));

  function timeFromPointer(event: PointerEvent<HTMLDivElement>): number {
    const rect = event.currentTarget.getBoundingClientRect();
    const viewX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const ratio = (viewX - MARGIN.left) / (WIDTH - MARGIN.left - MARGIN.right);
    const clamped = Math.min(Math.max(ratio, 0), 1);
    return startT + Math.round(((endT - startT) * clamped) / DAY_MS) * DAY_MS;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let next = activeIndex;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = activeIndex - 1;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") next = activeIndex + 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = series.length - 1;
    else if (event.key === "Escape") {
      onCursorChange(null);
      return;
    } else return;
    event.preventDefault();
    const target = series[Math.min(Math.max(next, 0), series.length - 1)];
    if (target) onCursorChange(target.t);
  }

  const tooltipAlign =
    cursorX === null
      ? ""
      : cursorX / WIDTH < 0.25
        ? ""
        : cursorX / WIDTH > 0.75
          ? "-translate-x-full"
          : "-translate-x-1/2";

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Explorar o histórico de preço"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={series.length - 1}
      aria-valuenow={activeIndex}
      aria-valuetext={describePoint(activePoint)}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => onCursorChange(timeFromPointer(event))}
      onPointerMove={(event) => onCursorChange(timeFromPointer(event))}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") onCursorChange(null);
      }}
      className="relative mx-auto w-full max-w-2xl touch-pan-y rounded-2xl select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden className="block h-auto w-full">
        {/* grade e eixo de preços */}
        {scale.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-separator"
              strokeWidth={1}
            />
            <text
              x={MARGIN.left - 8}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[10px] tabular-nums"
            >
              {formatAxisPrice(tick)}
            </text>
          </g>
        ))}

        {/* eixo de datas */}
        {xTicks.map((tick, index) => (
          <text
            key={tick}
            x={x(tick)}
            y={HEIGHT - 8}
            textAnchor={index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle"}
            className="fill-muted-foreground text-[10px]"
          >
            {index === xTicks.length - 1 ? "hoje" : formatDayMonth(tick)}
          </text>
        ))}

        <path d={area} className="fill-brand/10" />
        <path
          d={line}
          fill="none"
          className="stroke-brand"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* degraus em oferta */}
        {promoSteps.map((point) => (
          <circle
            key={point.t}
            cx={x(point.t)}
            cy={y(point.unitPriceCents)}
            r={3.5}
            className="fill-warning stroke-surface"
            strokeWidth={1.5}
          />
        ))}

        {/* preço de hoje */}
        <circle
          cx={x(last.t)}
          cy={y(last.unitPriceCents)}
          r={4.5}
          className="fill-brand stroke-surface"
          strokeWidth={2}
        />

        {/* cursor */}
        {cursorX !== null ? (
          <g>
            <line
              x1={cursorX}
              x2={cursorX}
              y1={MARGIN.top}
              y2={PLOT_BOTTOM}
              className="stroke-muted-foreground"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle
              cx={cursorX}
              cy={y(activePoint.unitPriceCents)}
              r={5}
              className="fill-surface stroke-brand"
              strokeWidth={2.5}
            />
          </g>
        ) : null}
      </svg>

      {cursorX !== null ? (
        <div
          aria-hidden
          style={{ left: `${(cursorX / WIDTH) * 100}%` }}
          className={cn(
            "glass-float pointer-events-none absolute top-0 z-10 w-max max-w-[14rem] space-y-0.5 rounded-xl px-3 py-2 text-sm",
            tooltipAlign,
          )}
        >
          <p className="type-caption">
            {formatLongDay(cursorT ?? activePoint.t)}
            {activePoint.promo ? " · em oferta" : ""}
          </p>
          <p className="font-semibold tabular-nums">
            {formatBRLUnit(activePoint.unitPriceCents, baseUnit)}
          </p>
          <p className="type-caption truncate">{nameOf(activePoint.storeId)}</p>
        </div>
      ) : null}

      {promoSteps.length > 0 ? (
        <p className="type-caption mt-1 flex items-center gap-1.5 px-1">
          <span aria-hidden className="inline-block size-2.5 rounded-full bg-warning" /> preço em
          oferta
        </p>
      ) : null}
    </div>
  );
}
