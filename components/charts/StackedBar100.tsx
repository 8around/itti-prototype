"use client";

import type { ReactElement } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BarShapeProps, TooltipContentProps } from "recharts";

import { AXIS_TEXT, CATEGORY_PALETTE, GRID_LINE, LABEL_FONT_SIZE_MIN, PAPER, VALUE_LABEL_FONT_WEIGHT } from "./chartTheme";
import { formatComma, formatPct1, NULL_PLACEHOLDER } from "./chartUtils";

/**
 * StackedBar100 — 가로 100% 스택 막대 (Recharts 재작성, V3). 화면 ② 손익 금융 프로필(순이자손익
 * 등 순액 3종)에서 쓴다. `Bar stackId`로 실제 라이브러리 스택을 쓴다 — `StackedBarsAbs`(V1)와
 * 같은 패턴이지만 카테고리가 항상 1개뿐이고(연도별 비교가 아니라 최신 연도 구성 하나) 값 자체가
 * 아니라 **구성비**를 보여주는 게 목적이라 `layout="vertical"`(가로 막대) + `domain=[0, total]`로
 * "막대 전체가 항상 100%"가 되게 한다.
 *
 * 팔레트 충돌 해소(task-V3-brief.md §40 "`CHART_PALETTE` 5색 순환 → 세그먼트 6개 이상이면 서로
 * 다른 항목이 동색"): `CATEGORY_PALETTE`(hue 분리 5색, chartTheme.ts)로 바꿔도 팔레트 길이
 * 자체는 5라 6개 이상이면 여전히 같은 hue가 재사용된다 — 대신 두 번째 순환부터
 * `fillOpacity`를 단계적으로 낮춰(`segmentVisual`) 같은 hue라도 명도 차이로 구별되게 한다
 * (Highcharts·D3 categorical 팔레트 순환의 표준 관례). 킷친싱크에 6세그먼트 데모로 검증한다.
 *
 * 막대 안 텍스트 신설(§40 "막대(20px 높이) 안에 텍스트 없음"): 세그먼트 폭이 `INLINE_LABEL_MIN_PCT`
 * (12%) 이상이면 세그먼트 중앙에 흰 텍스트로 퍼센트를 그린다 — 좁은 세그먼트는 겹침을 피해
 * 생략하고 아래 범례(`.mixlist`, PieChart와 공유)로만 노출한다.
 *
 * 결측 처리(global-constraints.md §1 "특히 StackedBar100이 쓰이는 금융 ②손익에서 결측을 0으로
 * 그리지 말 것"): 세그먼트 전부가 null/0 이하이면(`total === 0`) 스택 막대 자체를 그리지 않고
 * 자리 표시(`.stackedBar100Empty`)만 남긴다 — `total`로 나누는 스케일 계산에서 0-division을
 * 막는 목적도 겸한다.
 */

export type StackedBar100Segment = {
  label: string;
  value: number | null;
};

export type StackedBar100Props = {
  segments: StackedBar100Segment[];
};

/** 이 비율(%) 미만인 세그먼트는 막대 안 텍스트를 생략한다(겹침 방지) — 범례에는 항상 표시. */
const INLINE_LABEL_MIN_PCT = 12;

function segmentVisual(index: number): { fill: string; opacity: number } {
  const cycle = Math.floor(index / CATEGORY_PALETTE.length);
  return { fill: CATEGORY_PALETTE[index % CATEGORY_PALETTE.length], opacity: Math.max(0.45, 1 - cycle * 0.3) };
}

type Row = { category: string } & Record<string, number | string>;

function renderSegment(props: BarShapeProps, pct: number, visual: { fill: string; opacity: number }): ReactElement {
  const { x, y, width, height } = props;
  const showLabel = pct >= INLINE_LABEL_MIN_PCT;
  return (
    <g>
      <rect x={x} y={y} width={Math.max(width, 0)} height={height} fill={visual.fill} fillOpacity={visual.opacity} />
      {showLabel && (
        <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="middle" fontSize={LABEL_FONT_SIZE_MIN} fontWeight={VALUE_LABEL_FONT_WEIGHT} fill={PAPER}>
          {formatPct1(pct)}
        </text>
      )}
    </g>
  );
}

function StackedTooltip({ active, payload }: TooltipContentProps): ReactElement | null {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="chart-tooltip">
      {payload.map((p) => (
        <div className="chart-tooltip-row" key={String(p.dataKey)}>
          <span>{p.name}</span>
          <span className="chart-tooltip-value">{formatComma(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

export default function StackedBar100({ segments }: StackedBar100Props): ReactElement {
  const defined = segments.filter((s): s is { label: string; value: number } => s.value !== null && s.value > 0);
  const total = defined.reduce((sum, s) => sum + s.value, 0);
  const visualByLabel = new Map(defined.map((s, i) => [s.label, segmentVisual(i)]));

  const row: Row = { category: "composition" };
  for (const s of defined) row[s.label] = s.value;

  return (
    <div data-chart="stacked-bar-100">
      <div className="chart-plot chart-plot--stackedBar100">
        {total > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[row]} layout="vertical" margin={{ top: 24, right: 8, left: 4, bottom: 0 }} barCategoryGap="0%">
              <CartesianGrid horizontal={false} stroke={GRID_LINE} />
              <XAxis
                type="number"
                domain={[0, total]}
                ticks={[0, total / 2, total]}
                tickFormatter={(v: number) => `${Math.round((v / total) * 100)}%`}
                tick={{ fill: AXIS_TEXT, fontSize: LABEL_FONT_SIZE_MIN }}
                tickLine={{ stroke: GRID_LINE }}
                axisLine={{ stroke: GRID_LINE }}
                height={28}
              />
              <YAxis type="category" dataKey="category" hide />
              <Tooltip content={StackedTooltip} cursor={{ fill: GRID_LINE, opacity: 0.4 }} />
              {defined.map((s) => (
                <Bar
                  key={s.label}
                  dataKey={s.label}
                  stackId="stack"
                  name={s.label}
                  isAnimationActive={false}
                  shape={(shapeProps: BarShapeProps) => renderSegment(shapeProps, (s.value / total) * 100, visualByLabel.get(s.label)!)}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="stackedBar100Empty">{NULL_PLACEHOLDER}</div>
        )}
      </div>
      {total === 0 && <div className="cnote">세그먼트 전부 결측 — 근거 없는 0 대신 자리 표시만 표기</div>}
      <div className="mixlist">
        {segments.map((s) => {
          const missing = s.value === null || s.value <= 0;
          const visual = visualByLabel.get(s.label);
          return (
            <div className="mx" key={s.label}>
              <i style={{ background: missing ? "var(--line)" : visual?.fill, opacity: missing ? 1 : visual?.opacity }} />
              {s.label}
              <b className={missing ? "muted" : undefined}>{missing ? NULL_PLACEHOLDER : formatComma(s.value!)}</b>
              {!missing && <em>{formatPct1((s.value! / total) * 100)}</em>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
