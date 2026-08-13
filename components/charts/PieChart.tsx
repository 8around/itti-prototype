"use client";

import type { ReactElement } from "react";
import { Cell, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { PieLabelRenderProps, TooltipContentProps } from "recharts";

import { CATEGORY_PALETTE, LABEL_FONT_SIZE_MIN, VALUE_LABEL_COLOR, VALUE_LABEL_FONT_WEIGHT } from "./chartTheme";
import { formatPct1, NULL_PLACEHOLDER } from "./chartUtils";

/**
 * PieChart — 파이 (Recharts 재작성, V3). 종목 페이지에서는 이미 제거됐고 `/kitchen-sink`에만
 * 남아 있다(task-V3-brief.md 참조) — 유지하되 결함 2건을 고친다.
 *
 * 1. 직접 `<path>` arc를 그리던 `describeArc`/`polarToCartesian`(chartUtils.ts) 의존을 걷어내고
 *    Recharts 네이티브 `<Pie>`로 교체 — 슬라이스가 1개(100%)뿐이어도 라이브러리가 처리하므로
 *    수동 A커맨드 특이점 분기(`arcs.length === 1`일 때 `<circle>`로 대체하던 처리)가 필요 없다.
 * 2. 104px로 작아 얇은 슬라이스가 거의 안 보이던 결함 — `PIE_PLOT_SIZE`(200px)로 키우고, Recharts
 *    공식 "Customized Label" 예제 패턴(`cx + radius·cos(-midAngle·RADIAN)`, Recharts 문서의
 *    파이 라벨 예제와 동일한 극좌표 변환)으로 슬라이스 **바깥**에 퍼센트 라벨을 그린다 — 슬라이스가
 *    가늘어 안쪽에 글자가 안 들어가도 바깥 라벨은 항상 자리가 있다. `LABEL_MIN_PERCENT` 미만인
 *    슬라이스는 라벨끼리 겹치는 걸 막으려 라벨을 생략하되(색 자체는 그대로 보임), 범례에는 항상
 *    표시한다.
 *
 * 색은 `CHART_PALETTE`(구 5색, hue 미분리) 대신 `CATEGORY_PALETTE`(hue 분리 5색)를 쓴다. 값이
 * null인 슬라이스는 그리지 않고 범례(`.mixlist`, StackedBar100과 공유)에만 회색 자리 표시로
 * 남긴다(근거 없는 0 금지).
 */

export type PieSlice = {
  label: string;
  value: number | null;
};

export type PieChartProps = {
  slices: PieSlice[];
};

const RADIAN = Math.PI / 180;
const OUTER_RADIUS = 76;
const LABEL_RADIUS = OUTER_RADIUS + 18;
const LABEL_MIN_PERCENT = 0.03;

function renderSliceLabel(props: PieLabelRenderProps): ReactElement | null {
  const { cx, cy, midAngle, percent } = props;
  if (cx == null || cy == null || midAngle == null || percent == null || percent < LABEL_MIN_PERCENT) return null;
  const cxNum = Number(cx);
  const x = cxNum + LABEL_RADIUS * Math.cos(-midAngle * RADIAN);
  const y = Number(cy) + LABEL_RADIUS * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} textAnchor={x > cxNum ? "start" : "end"} dominantBaseline="middle" fontSize={LABEL_FONT_SIZE_MIN} fontWeight={VALUE_LABEL_FONT_WEIGHT} fill={VALUE_LABEL_COLOR}>
      {formatPct1(percent * 100)}
    </text>
  );
}

function PieTooltip({ active, payload }: TooltipContentProps): ReactElement | null {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0];
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-row">
        <span>{p.name}</span>
        <span className="chart-tooltip-value">{formatPct1(Number(p.value))}</span>
      </div>
    </div>
  );
}

export default function PieChart({ slices }: PieChartProps): ReactElement {
  const defined = slices.filter((s): s is { label: string; value: number } => s.value !== null && s.value > 0);
  const total = defined.reduce((sum, s) => sum + s.value, 0);
  const colorByLabel = new Map(defined.map((s, i) => [s.label, CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]]));
  const data = defined.map((s) => ({ label: s.label, value: (s.value / total) * 100 }));

  return (
    <div className="pie-row" data-chart="pie-chart">
      <div className="chart-plot chart-plot--pie">
        {total > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsPieChart>
              <Tooltip content={PieTooltip} />
              <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={OUTER_RADIUS} isAnimationActive={false} label={renderSliceLabel} labelLine={false}>
                {data.map((d) => (
                  <Cell key={d.label} fill={colorByLabel.get(d.label)} />
                ))}
              </Pie>
            </RechartsPieChart>
          </ResponsiveContainer>
        ) : (
          <div className="stackedBar100Empty">{NULL_PLACEHOLDER}</div>
        )}
      </div>
      <div className="mixlist">
        {slices.map((s) => {
          const missing = s.value === null || s.value <= 0;
          return (
            <div className="mx" key={s.label}>
              <i style={{ background: missing ? "var(--line)" : colorByLabel.get(s.label) }} />
              {s.label}
              <b className={missing ? "muted" : undefined}>{missing || total === 0 ? NULL_PLACEHOLDER : formatPct1((s.value! / total) * 100)}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}
