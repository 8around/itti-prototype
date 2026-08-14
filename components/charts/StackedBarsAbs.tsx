"use client";

import type { ReactElement } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BarShapeProps, TooltipContentProps } from "recharts";

import { AXIS_TEXT, BAR_MAX_SIZE, CATEGORY_PALETTE, GRID_LINE, LABEL_FONT_SIZE_MIN } from "./chartTheme";
import { formatComma, NULL_PLACEHOLDER } from "./chartUtils";
import { MissingMarker, padDomain, ValueLabel } from "./rechartsPrimitives";

/**
 * StackedBarsAbs — 세로 절대값 누적 막대 (Recharts 재작성, V1). 학습가이드 `stacked()` 참조,
 * SET2 "자산 구성 추이 — 아래 초록=자본, 위 빨강=부채". `Bar stackId`로 실제 라이브러리 스택을
 * 쓴다 — v2까지는 직접 `%` 높이를 계산해 쌓았지만, 여기서는 세그먼트 하나당 `<Bar dataKey={라벨}
 * stackId="stack">` 하나씩을 등록하면 Recharts가 스택·도메인을 알아서 계산한다.
 *
 * 세그먼트 값 접근성(리뷰 지적): 예전에는 `title` 속성(hover)에만 세그먼트 값이 있어 터치
 * 기기에서 접근 불가했다 — Recharts `Tooltip`(탭으로도 열림)으로 해소했다.
 *
 * 합계 라벨과 "전 세그먼트 결측" 빈 자리 표시는 실제 스택 Bar와 같은 Y축을 공유하는 구조용
 * Bar 2개(`__stackTotal`/`__stackAllMissing`, 둘 다 `stackId` 없이 렌더만 담당)로 처리한다 —
 * 세그먼트 dataKey와 이름이 겹치지 않도록 `__` 접두사를 쓴다.
 */

export type StackedBarsAbsSegment = {
  label: string;
  /** null이면 근거 없는 0 대신 스택·합계에서 제외한다. */
  value: number | null;
  /** 세그먼트 색 오버라이드. 미지정 시 등장 순서 기준 `CATEGORY_PALETTE` 순환(기존 동작, 하위호환).
   * 같은 라벨의 첫 지정값이 전 막대·범례에 적용된다. */
  color?: string;
  /** 세그먼트 불투명도(0~1) 오버라이드. 미지정 시 1. */
  opacity?: number;
};

export type StackedBarsAbsBar = {
  label: string;
  /** 아래→위로 쌓이는 순서. */
  segments: StackedBarsAbsSegment[];
};

export type StackedBarsAbsProps = {
  bars: StackedBarsAbsBar[];
};

const TOTAL_KEY = "__stackTotal";
const EMPTY_KEY = "__stackAllMissing";

type Row = Record<string, number | string | boolean> & {
  label: string;
  [TOTAL_KEY]: number;
  [EMPTY_KEY]: number;
  allMissing: boolean;
};

function renderTotalLabel(props: BarShapeProps): ReactElement | null {
  const row = props.payload as Row;
  if (row.allMissing) return null;
  return <ValueLabel x={props.x + props.width / 2} y={props.y} text={formatComma(row[TOTAL_KEY] as number)} place="above" />;
}

function renderEmptyMarker(props: BarShapeProps): ReactElement | null {
  const row = props.payload as Row;
  if (!row.allMissing) return null;
  const cx = props.x + props.width / 2;
  return (
    <g>
      <MissingMarker x={props.x} y={props.y} width={props.width} />
      <ValueLabel x={cx} y={props.y} text={NULL_PLACEHOLDER} tone="missing" place="above" />
    </g>
  );
}

function StackedTooltip({ active, payload, label }: TooltipContentProps): ReactElement | null {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload.filter((p) => typeof p.dataKey === "string" && !p.dataKey.startsWith("__"));
  if (rows.length === 0) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{label}</div>
      {rows.map((p) => (
        <div className="chart-tooltip-row" key={String(p.dataKey)}>
          <span>{p.name}</span>
          <span className="chart-tooltip-value">{formatComma(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

export default function StackedBarsAbs({ bars }: StackedBarsAbsProps): ReactElement {
  const allLabels = Array.from(new Set(bars.flatMap((b) => b.segments.map((s) => s.label))));
  const colorOverrideByLabel = new Map<string, string>();
  const opacityByLabel = new Map<string, number>();
  for (const bar of bars) {
    for (const seg of bar.segments) {
      if (seg.color !== undefined && !colorOverrideByLabel.has(seg.label)) colorOverrideByLabel.set(seg.label, seg.color);
      if (seg.opacity !== undefined && !opacityByLabel.has(seg.label)) opacityByLabel.set(seg.label, seg.opacity);
    }
  }
  const colorByLabel = new Map(
    allLabels.map((label, i) => [label, colorOverrideByLabel.get(label) ?? CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]]),
  );

  const data: Row[] = bars.map((bar) => {
    const defined = bar.segments.filter((s): s is { label: string; value: number } => s.value !== null);
    const total = defined.reduce((sum, s) => sum + s.value, 0);
    const allMissing = defined.length === 0;
    const row: Row = { label: bar.label, [TOTAL_KEY]: total, [EMPTY_KEY]: 0, allMissing };
    for (const label of allLabels) {
      const seg = bar.segments.find((s) => s.label === label);
      row[label] = seg?.value ?? 0;
    }
    return row;
  });
  const maxTotal = Math.max(1, ...data.map((r) => r[TOTAL_KEY] as number));
  const { domain, tickCount } = padDomain([0, maxTotal]);

  return (
    <div data-chart="stacked-bars-abs">
      <div className="chart-plot chart-plot--stackedOrOverlay">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 24, right: 8, left: 4, bottom: 0 }} barCategoryGap="24%">
            <CartesianGrid vertical={false} stroke={GRID_LINE} />
            <XAxis
              dataKey="label"
              tick={{ fill: AXIS_TEXT, fontSize: LABEL_FONT_SIZE_MIN }}
              tickLine={{ stroke: GRID_LINE }}
              axisLine={{ stroke: GRID_LINE }}
              tickMargin={6}
              height={28}
            />
            <YAxis
              domain={domain}
              tickCount={tickCount}
              tick={{ fill: AXIS_TEXT, fontSize: LABEL_FONT_SIZE_MIN }}
              tickLine={{ stroke: GRID_LINE }}
              axisLine={false}
              tickFormatter={(v: number) => formatComma(v)}
              width={52}
            />
            <Tooltip content={StackedTooltip} cursor={{ fill: GRID_LINE, opacity: 0.4 }} />
            {allLabels.map((label, i) => (
              <Bar
                key={label}
                dataKey={label}
                stackId="stack"
                name={label}
                fill={colorByLabel.get(label)}
                fillOpacity={opacityByLabel.get(label) ?? 1}
                isAnimationActive={false}
                maxBarSize={BAR_MAX_SIZE}
                radius={i === 0 ? [0, 0, 4, 4] : i === allLabels.length - 1 ? [4, 4, 0, 0] : 0}
              />
            ))}
            <Bar dataKey={TOTAL_KEY} shape={renderTotalLabel} isAnimationActive={false} maxBarSize={BAR_MAX_SIZE} legendType="none" name="합계" />
            <Bar dataKey={EMPTY_KEY} shape={renderEmptyMarker} isAnimationActive={false} maxBarSize={BAR_MAX_SIZE} legendType="none" name="—" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="leg">
        {allLabels.map((label) => (
          <span key={label}>
            <span className="d" style={{ background: colorByLabel.get(label), opacity: opacityByLabel.get(label) ?? 1 }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
