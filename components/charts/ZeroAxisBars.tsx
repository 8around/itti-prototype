"use client";

import type { ReactElement } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { BarShapeProps } from "recharts";

import { AXIS_TEXT, BAR_MAX_SIZE, GREEN, GRID_LINE, LABEL_FONT_SIZE_MIN, LOSS, PROVISIONAL, PROVISIONAL_FILL } from "./chartTheme";
import { formatComma, NULL_PLACEHOLDER } from "./chartUtils";
import { MissingMarker, normalizeRect, padDomain, ValueLabel, zeroInclusiveDomain } from "./rechartsPrimitives";

/**
 * ZeroAxisBars — 0 기준선 발산 막대 (Recharts 재작성, V1). 목업 `.zbrow/.zbtop/.zbbot/.zline`을
 * `BarChart` + `ReferenceLine y={0}` + 커스텀 `Bar shape`로 대체한다. 양수는 기준선 위, 음수는
 * 아래로 그린다(승인 규칙 1) — v2까지는 `signedAxisScale`이 위/아래 영역을 수동으로 배분해 px per
 * unit을 맞췄지만, 이제는 Recharts의 실제 선형 Y축 스케일이 그 성질을 자동으로 보장한다(선형
 * 스케일은 정의상 전 구간에서 px/unit이 일정하다) — `signedAxisScale` 의존을 제거했다.
 *
 * 공개 props 계약은 v2와 동일하게 유지한다(`bars`/`unit`/`compactLabels`) — 호출부
 * (`app/stock/[code]/page.tsx`)는 변경 없이 그대로 동작한다. `compactLabels`의 의미는 바뀌었다:
 * 예전에는 라벨·값 폰트를 6.5~7px까지 줄이는 용도였지만, 전역 제약(라벨 폰트 ≥11px)이 이를
 * 금지하므로 이제는 X축 `interval={0}`(전 라벨 강제 표시, 자동 스킵 방지)만 의미한다 — 8분기
 * 윈도처럼 카테고리가 많을 때 라벨이 조용히 생략되는 것을 막는다.
 */

export type ZeroAxisBar = {
  label: string;
  /** null이면 근거 없는 0 대신 자리 표시만 한다. */
  value: number | null;
  /** 확정 전 잠정치(4Q 역산 등) — 막대 테두리 dashed + 주황(PROVISIONAL)으로 구분. */
  provisional?: boolean;
};

export type ZeroAxisBarsProps = {
  bars: ZeroAxisBar[];
  /** 우상단에 표시할 단위/구간 라벨 (예: "억원 · 최근 5분기"). */
  unit?: string;
  /** true면 X축 라벨을 전부 강제 표시한다(자동 스킵 방지) — 분기 수가 많을 때(8분기 이상 등) 쓴다. */
  compactLabels?: boolean;
};

type Row = {
  label: string;
  valueForScale: number;
  value: number | null;
  missing: boolean;
  negative: boolean;
  provisional: boolean;
};

function renderBar(props: BarShapeProps): ReactElement | null {
  const { x, y, width, height } = props;
  const row = props.payload as Row;

  if (row.missing) {
    return (
      <g>
        <MissingMarker x={x} y={y} width={width} />
        <ValueLabel x={x + width / 2} y={y} text={NULL_PLACEHOLDER} tone="missing" place="above" />
      </g>
    );
  }

  const { top, height: h } = normalizeRect(y, height);
  const cx = x + width / 2;
  const fill = row.provisional ? PROVISIONAL_FILL : row.negative ? LOSS : GREEN;
  const stroke = row.provisional ? PROVISIONAL : undefined;
  const tone = row.provisional ? "provisional" : row.negative ? "negative" : "default";
  const labelText = formatComma(row.value as number);

  return (
    <g>
      <rect
        x={x}
        y={top}
        width={width}
        height={Math.max(h, 1)}
        rx={3}
        fill={fill}
        stroke={stroke}
        strokeWidth={stroke ? 1.5 : undefined}
        strokeDasharray={stroke ? "4 3" : undefined}
      />
      <ValueLabel x={cx} y={row.negative ? top + h : top} text={labelText} tone={tone} place={row.negative ? "below" : "above"} />
    </g>
  );
}

export default function ZeroAxisBars({ bars, unit, compactLabels }: ZeroAxisBarsProps): ReactElement {
  const data: Row[] = bars.map((b) => ({
    label: b.label,
    valueForScale: b.value ?? 0,
    value: b.value,
    missing: b.value === null,
    negative: (b.value ?? 0) < 0,
    provisional: Boolean(b.provisional),
  }));
  const { domain, tickCount } = padDomain(zeroInclusiveDomain(bars.map((b) => b.value)));

  return (
    <div data-chart="zero-axis-bars">
      {unit && <div className="qb-unit">{unit}</div>}
      <div className="chart-plot chart-plot--quarterBars">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 24, right: 8, left: 4, bottom: 0 }} barCategoryGap="18%">
            <CartesianGrid vertical={false} stroke={GRID_LINE} />
            <XAxis
              dataKey="label"
              tick={{ fill: AXIS_TEXT, fontSize: LABEL_FONT_SIZE_MIN }}
              tickLine={{ stroke: GRID_LINE }}
              axisLine={{ stroke: GRID_LINE }}
              tickMargin={6}
              height={28}
              interval={compactLabels ? 0 : undefined}
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
            <ReferenceLine y={0} stroke={AXIS_TEXT} strokeOpacity={0.6} />
            <Bar dataKey="valueForScale" shape={renderBar} isAnimationActive={false} maxBarSize={BAR_MAX_SIZE} minPointSize={2} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
