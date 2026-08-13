"use client";

import type { ReactElement } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { BarShapeProps } from "recharts";

import { AXIS_TEXT, BAR_MAX_SIZE, CASH_FLOW_SERIES_COLORS, GRID_LINE, LABEL_FONT_SIZE_MIN } from "./chartTheme";
import { formatComma, NULL_PLACEHOLDER } from "./chartUtils";
import { MissingMarker, normalizeRect, padDomain, ValueLabel, zeroInclusiveDomain } from "./rechartsPrimitives";

/**
 * SignedGroupedBars — 0축 기준 n계열 × m기간 발산 그룹 막대 (Recharts 재작성, V2). 학습가이드
 * `bars()`의 발산 막대 개념을 다계열로 확장 — SET3 "현금흐름 — 위=유입, 아래=유출". `ZeroAxisBars`
 * (단일 계열)의 다계열 버전이자, `CashFlowDiverging`(가로·1기간만)과 달리 세로·다기간 비교에
 * 쓴다. 계열마다 `<Bar dataKey={"s"+i}>` 하나씩(`stackId` 없음 — 그룹형)을 등록해 Recharts가
 * 나란히 배치한다.
 *
 * V1 패턴 재사용(task-V1-report.md §8): `signedAxisScale`(v2까지 수동으로 위/아래 영역을
 * 배분하던 헬퍼, I1에서 px-per-unit 대칭을 고치려고 도입)를 퇴역시켰다 — `ZeroAxisBars`가 이미
 * 증명했듯 Recharts의 실제 선형 Y축 스케일은 정의상 전 구간 px/unit이 일정하므로 수동 배분이
 * 필요 없다(0을 포함하는 도메인만 `zeroInclusiveDomain`+`padDomain`으로 보장하면 된다).
 *
 * 계열 색은 `CASH_FLOW_SERIES_COLORS`(영업/투자/재무 고정 순서)를 인덱스로 **직접** 매핑한다 —
 * `CATEGORY_PALETTE`처럼 재배치 가능한 범용 팔레트를 순환 인덱싱하지 않는다
 * (global-constraints.md §1 "카테고리 팔레트 재배치" 참고, chartTheme.ts의 상수 doc과 동일 경고).
 *
 * 값 라벨 신설(V2, 이전엔 완전히 없었다): 얇은 막대(예전 9px) n개가 한 슬롯에 나란히 들어가는
 * 특성상 라벨이 서로 겹칠 여지가 있어 `BAR_MAX_SIZE` 상한 안에서 폭을 최대한 확보하고, 라벨
 * 텍스트는 억원 단위를 정수로 반올림해(`Math.round`) 자릿수를 줄인다(막대 높이 자체는 원값을
 * 그대로 스케일에 쓴다 — 반올림은 라벨 표시에만 적용).
 *
 * 최종 리뷰 픽스(I1, V1까지): 손실은 0축 아래, 위/아래 px-per-unit 대칭 — 삼성전자 24년 투자CF
 * −85.38조가 영업CF +72.98조보다 크게 그려져야 한다(예전 56px/26px 고정 분할은 이 비교를
 * 뒤집었다). Recharts 네이티브 선형 스케일로 옮기면서 이 성질이 스케일 자체의 정의로 보장된다.
 */

export type SignedGroupedBarsGroup = {
  label: string;
  /** seriesLabels와 같은 순서·길이. null이면 근거 없는 0 대신 결측 마커만 표시한다. */
  values: (number | null)[];
};

export type SignedGroupedBarsProps = {
  groups: SignedGroupedBarsGroup[];
  seriesLabels: string[];
};

type Row = Record<string, number | string | boolean> & { label: string };

function seriesValueKey(i: number): string {
  return `s${i}`;
}

function seriesMissingKey(i: number): string {
  return `s${i}Missing`;
}

function seriesColor(i: number): string {
  return CASH_FLOW_SERIES_COLORS[i % CASH_FLOW_SERIES_COLORS.length];
}

function renderSeriesBar(props: BarShapeProps, seriesIndex: number): ReactElement | null {
  const { x, y, width, height } = props;
  const row = props.payload as Row;
  const missing = row[seriesMissingKey(seriesIndex)] as boolean;
  const cx = x + width / 2;

  if (missing) {
    return (
      <g>
        <MissingMarker x={x} y={y} width={width} />
        <ValueLabel x={cx} y={y} text={NULL_PLACEHOLDER} tone="missing" place="above" />
      </g>
    );
  }

  const { top, height: h } = normalizeRect(y, height);
  const value = row[seriesValueKey(seriesIndex)] as number;
  const negative = value < 0;
  const labelText = formatComma(Math.round(value));

  return (
    <g>
      <rect x={x} y={top} width={width} height={Math.max(h, 1)} rx={3} fill={seriesColor(seriesIndex)} />
      <ValueLabel x={cx} y={negative ? top + h : top} text={labelText} tone={negative ? "negative" : "default"} place={negative ? "below" : "above"} />
    </g>
  );
}

export default function SignedGroupedBars({ groups, seriesLabels }: SignedGroupedBarsProps): ReactElement {
  const data: Row[] = groups.map((g) => {
    const row: Row = { label: g.label };
    seriesLabels.forEach((_, i) => {
      const v = g.values[i] ?? null;
      row[seriesValueKey(i)] = v ?? 0;
      row[seriesMissingKey(i)] = v === null;
    });
    return row;
  });
  const domain = padDomain(zeroInclusiveDomain(groups.flatMap((g) => g.values)));

  return (
    <div data-chart="signed-grouped-bars">
      <div className="chart-plot chart-plot--stackedOrOverlay">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 24, right: 8, left: 4, bottom: 0 }} barCategoryGap="20%" barGap={4}>
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
              tick={{ fill: AXIS_TEXT, fontSize: LABEL_FONT_SIZE_MIN }}
              tickLine={{ stroke: GRID_LINE }}
              axisLine={false}
              tickFormatter={(v: number) => formatComma(v)}
              width={52}
            />
            <ReferenceLine y={0} stroke={AXIS_TEXT} strokeOpacity={0.6} />
            {seriesLabels.map((label, i) => (
              <Bar
                key={seriesValueKey(i)}
                dataKey={seriesValueKey(i)}
                name={label}
                shape={(props: BarShapeProps) => renderSeriesBar(props, i)}
                isAnimationActive={false}
                maxBarSize={BAR_MAX_SIZE}
                minPointSize={2}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="leg">
        {seriesLabels.map((label, i) => (
          <span key={label}>
            <span className="d" style={{ background: seriesColor(i) }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
