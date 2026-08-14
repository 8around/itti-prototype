"use client";

import type { ReactElement } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { BarShapeProps } from "recharts";

import { AXIS_TEXT, BAR_MAX_SIZE, GREEN, GRID_LINE, LABEL_FONT_SIZE_MIN, LOSS } from "./chartTheme";
import { formatComma, formatPct1, NULL_PLACEHOLDER } from "./chartUtils";
import { MissingMarker, padDomain, zeroInclusiveDomain } from "./rechartsPrimitives";

/**
 * PnlWaterfall — 손익 구조 가로 막대 (Recharts 재작성, V3). 화면 ② 손익(연간 FY 기준)에서
 * 매출 대비 각 단계(매출총이익·영업이익·순이익 등)의 비중을 비교한다. "워터폴"이라는 이름은
 * 목업 유산(`.wf`)이고, 실제로는 계단식 누적(브릿지)이 아니라 **각 단계를 매출=100% 기준으로
 * 독립 환산한 비율**이다(`ratioPct = value / 매출 × 100`, `app/stock/[code]/page.tsx`의
 * `chartRows` 계산 그대로) — 이 성질은 V3에서도 바뀌지 않는다(props 계약 무변경).
 *
 * **Recharts 공식 예제의 range dataKey 패턴**(task-V3-brief.md 지시): `<Bar dataKey>`가 가리키는
 * 값에 스칼라 대신 `[start, end]` 2-튜플을 직접 넣으면(`node_modules/recharts/es6/cartesian/
 * Bar.js` `getValueByDataKey` 결과가 배열이면 그대로 `[baseValue, currentValue]`로 쓴다 —
 * `getStackedData`의 "ranged data" 주석과 대응) 막대 폭이 항상 음수 없이 계산된다.
 * `[Math.min(0,v), Math.max(0,v)]`로 넣으면 부호와 무관하게 `width`가 항상 ≥0이라
 * `normalizeRect` 같은 후처리가 필요 없다(ZeroAxisBars가 겪은 부호 정규화를 애초에 피하는
 * 방식). 적자 단계(ratioPct 음수)는 0 기준선 왼쪽으로 자연히 뻗는다 — 승인 규칙 1(손실은 기준선
 * 반대편)의 가로축 버전. 결측 행은 `rangeForScale=[0,0]`이라 `props.x`가 곧 0-기준선 픽셀이라
 * (양 끝이 같은 값으로 매핑) 별도 `background` 트릭 없이 `MissingMarker`를 그 위치에 그린다.
 *
 * **3컬럼 레이아웃(라벨 | 차트 | 값)으로 재설계한 이유(실측으로 발견한 회귀)**: 처음엔
 * `OverlaidBars`/`StackedBarsAbs`가 쓰는 `background` 트릭으로 값·비율 텍스트를 SVG 안
 * "플롯 오른쪽 끝" 고정 x에 직접 그렸다. 종목 페이지(카드 폭 ~650px)에서는 문제없었지만,
 * 킷친싱크 그리드 카드(`minmax(300px, 1fr)`, 300~380px)에서 실측하니 `YAxis`(라벨, 128px) +
 * `margin.right`(텍스트, 150px대)만으로 카드 폭의 90% 이상을 차지해 정작 막대·축 영역이 실측
 * ~100px로 짜부라졌다(0%·100% 눈금이 서로 붙어 보일 정도) — 고정 픽셀 텍스트 컬럼을 SVG
 * `margin`에 넣는 방식은 좁은 컨테이너에 근본적으로 반응형이 아니다. 값·비율 텍스트를 SVG
 * 밖 **HTML 컬럼**으로 옮기면 텍스트 폭이 막대 플롯 폭과 경쟁하지 않는다 — 라벨 컬럼도 같은
 * 이유로 HTML로 옮겨(`YAxis hide`) 좌|차트|우 3열 flex로 구성했다. 세 컬럼은
 * `align-items: stretch`로 높이를 `.chart-plot--waterfall`에 맞추고, 라벨·값 컬럼에
 * `padding: 24px 0 28px`(BarChart `margin.top`·`XAxis height`와 동일 리터럴)를 줘 각 행이
 * SVG 쪽 막대 밴드와 대략 같은 세로 위치에 오도록 맞춘다(픽셀 완전 정합은 아니지만 4행 정도
 * 개수에서는 육안으로 어긋나지 않는다).
 *
 * 라벨 잘림 결함 해소(task-V3-brief.md §40 "`.wl` 58px 고정 폭이라 긴 라벨 잘림 처리 없음"):
 * HTML 라벨 컬럼은 고정 px 폭이 아니라 `flex-basis`라 "당기순이익(지배주주)"(11자)도 줄바꿈
 * 없이 자기 폭만큼 자연히 넓어진다.
 */

export type PnlWaterfallRow = {
  label: string;
  /** 억원 등 절대값. null이면 근거 없는 0 대신 자리 표시만 한다. */
  value: number | null;
  /** 매출 대비 비율(%). null이면 막대를 그리지 않는다. */
  ratioPct: number | null;
};

export type PnlWaterfallProps = {
  rows: PnlWaterfallRow[];
};

type Row = {
  label: string;
  rangeForScale: [number, number];
  missing: boolean;
  negative: boolean;
};

function renderBar(props: BarShapeProps): ReactElement | null {
  const { x, y, width, height } = props;
  const row = props.payload as Row;

  if (row.missing) {
    return <MissingMarker x={x} y={y + height / 2} width={20} />;
  }

  return <rect x={x} y={y} width={Math.max(width, 1)} height={height} rx={3} fill={row.negative ? LOSS : GREEN} />;
}

export default function PnlWaterfall({ rows }: PnlWaterfallProps): ReactElement {
  const data: Row[] = rows.map((r) => {
    const missing = r.value === null || r.ratioPct === null;
    const ratio = r.ratioPct ?? 0;
    return {
      label: r.label,
      rangeForScale: missing ? [0, 0] : [Math.min(0, ratio), Math.max(0, ratio)],
      missing,
      negative: !missing && ratio < 0,
    };
  });
  const { domain, tickCount } = padDomain(zeroInclusiveDomain(rows.map((r) => r.ratioPct)));

  return (
    <div className="wf3" data-chart="pnl-waterfall">
      <div className="wf3-col wf3-labels">
        {rows.map((r) => (
          <div className="wf3-row" key={r.label}>
            {r.label}
          </div>
        ))}
      </div>
      <div className="chart-plot chart-plot--waterfall wf3-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 24, right: 8, left: 4, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid horizontal={false} stroke={GRID_LINE} />
            <XAxis
              type="number"
              domain={domain}
              tickCount={tickCount}
              tick={{ fill: AXIS_TEXT, fontSize: LABEL_FONT_SIZE_MIN }}
              tickLine={{ stroke: GRID_LINE }}
              axisLine={{ stroke: GRID_LINE }}
              tickFormatter={(v: number) => `${v}%`}
              height={28}
            />
            <YAxis type="category" dataKey="label" hide />
            <Bar dataKey="rangeForScale" shape={renderBar} isAnimationActive={false} maxBarSize={BAR_MAX_SIZE} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="wf3-col wf3-values">
        {rows.map((r) => {
          const missing = r.value === null || r.ratioPct === null;
          return (
            <div className="wf3-row" key={r.label}>
              {missing ? NULL_PLACEHOLDER : `${formatComma(Math.round(r.value as number))} · ${formatPct1(r.ratioPct as number)}`}
            </div>
          );
        })}
      </div>
    </div>
  );
}
