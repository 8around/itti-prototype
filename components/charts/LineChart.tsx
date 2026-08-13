"use client";

import type { ReactElement } from "react";
import { CartesianGrid, Line, LineChart as RechartsLineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { DotItemDotProps, LineDrawShapeProps } from "recharts";

import { AXIS_TEXT, GREEN, GRID_LINE, LABEL_FONT_SIZE_MIN, LOSS, MUTED_TEXT, PAPER, PROVISIONAL } from "./chartTheme";
import { formatComma, NULL_PLACEHOLDER } from "./chartUtils";
import { MissingMarker, niceDomain, splitLineRuns, StateChip, ValueLabel } from "./rechartsPrimitives";

/**
 * LineChart — 꺾은선 (Recharts 재작성, V2). 목업 `<polyline>` + `stroke-dasharray`를 대체한다
 * (화면 ② 손익 YoY/QoQ, ⑤ ROE·영업이익률, ⑥ 부채비율). `provisional`이 true인 지점(4Q 역산 등)은
 * 주황 점선 + 큰 원형 마커로 확정 구간과 구분한다. 값이 null인 지점은 선을 끊고 결측 마커로
 * 표시한다.
 *
 * V1 패턴 재사용(task-V1-report.md §8): `padDomain`/`zeroInclusiveDomain`은 0을 지나는 발산
 * 막대 전용이라 여기서는 대신 `niceDomain`(양방향 nice-round, 0 통과를 강제하지 않음)을 쓴다.
 * 그래픽 아이템은 `<Line>` **하나**만 두고(V1의 `Bar shape` 패턴과 동일 구조) 커스텀 `shape`로
 * run(구간)별 실선/점선 `<polyline>`을, 커스텀 `dot`로 점·값 라벨·상태 칩·결측 마커를 그린다.
 *
 * **`<Line>`을 하나만 두는 이유(실측으로 확인한 함정)**: 처음엔 run마다 부분집합 `data`를 가진
 * 별도 `<Line>`을 두는 설계였는데, 실제 렌더 결과 (1) 부분집합 `data`를 쓰면 카테고리(XAxis
 * `dataKey="label"`) 위치가 **부분집합 배열의 인덱스**로 재계산돼 뒤쪽 구간이 앞쪽으로 쏠리는
 * 지그재그가 생겼고, (2) 길이를 맞춰(`rows` 전체 + 나머지 null) 부분집합 문제를 없앤 뒤에도
 * `<Line>`마다 서로 다른 `data` 참조를 주면 Recharts가 XAxis 눈금 라벨을 `<Line>` 개수만큼
 * 중복 렌더링했다(`<Line>` 5개 → 라벨 5벌, DOM으로 직접 확인). 두 문제 다 `<Line>`을 하나로
 * 합치고 그 안에서 전부 커스텀 렌더링하면 원천적으로 사라진다.
 *
 * 값이 없는 지점(결측·상태 칩)에 실제 Y 픽셀을 주는 방법: `value` 필드에 **도메인 중앙값을
 * "sentinel"로 채워** 넣어(`payload.drawable=false`로 구분) Recharts 자신의 스케일이 그 지점의
 * y도 정상적으로 계산하게 한다 — Recharts 내부 스케일 훅(`useYAxisScale` 등)은 훅이라 일반 함수
 * 호출로 실행되는 `shape`/`dot` 콜백 안에서 쓸 수 없고, sentinel 트릭은 이 제약 없이 도메인이
 * 바뀌어도 항상 유효한 좌표를 준다.
 *
 * 최종 리뷰 픽스(M5, V1까지): 점선 판정은 **구간(인접 두 지점) 단위**다 — 8분기 윈도에 Q4가
 * 둘 들어갈 수 있어(2024Q4·2025Q4) 첫 Q4 뒤의 확정 분기까지 잠정으로 오염되면 회귀다.
 *
 * v2 T3 확장 (전부 옵셔널 — 기존 `points: {label,value,provisional?}[]` 단독 호출부는
 * 그대로 동작해 하위호환 유지):
 * - `baseline`: 도메인(min/max)에 강제 포함되는 기준선(예: 부채비율 100%) — 학습가이드 `line()`의
 *   `opts.threshold` 처리를 그대로 이식하되, **데이터 쪽 해상도를 우선 확보**한다(아래 도메인
 *   계산 참고 — 학습가이드 원본처럼 threshold를 먼저 min/max에 접고 나서 25% 패딩하면, 기준선이
 *   데이터에서 멀 때(부채비율 25~30% vs 기준선 100%) 패딩 자체가 훨씬 커져 데이터가 더 눌린다).
 *   항상 `--up`(적색) 점선으로 그린다(기준선=경고선 관례, 학습가이드와 동일 배색).
 * - `color`: 선·점 색(기본 `--green`) — CSS 색상 값 또는 `var(--token)` 문자열을 그대로 받는
 *   기존 계약 유지(task-V1-report.md §1 확인 — `stroke`에 직접 대입하는 단순 경로는 `var()`도
 *   안전하다).
 * - `points[].state`: 값 대신 상태 칩(예: "흑자전환")을 표시. 값이 있어도 내부적으로 null
 *   취급해 선을 끊는다. **자체 문구를 새로 정의하지 말 것**: `DisplayState`의
 *   `TURN_TO_PROFIT`/`TURN_TO_LOSS`/`LOSS_CONTINUED`가 이미 `MetricValue`에서
 *   "흑자전환"/"적자전환"/"적자지속"으로 렌더된다(components/MetricValue.tsx `renderText()`가
 *   정본) — 호출부가 그 정본 문구를 그대로 넘긴다. LineChart 자체는 `DisplayState`를 import하지
 *   않는다(차트 프리미티브를 정규화 레이어에서 계속 분리하기 위해 `state`는 일부러 순수 문자열).
 * - `unit`/`sign`: 값 라벨에 단위 접미사·양수 `+` 접두사. 음수 값은 `--up`(적색)으로 표시.
 *
 * 개선점 B(v2 컨트롤러 육안 검증): 전 포인트가 `state`만 있고(예: 8분기 전부 "적자지속") 그릴 수
 * 있는 값이 0개면 선·점은 하나도 안 그려지지만 `baseline`(있으면)은 그대로 렌더해 축·기준선을
 * 유지하고, 그 경우 SVG 안에 음소거 톤(`--gray-2`) 안내 문구 1줄을 추가한다.
 *
 * 값 라벨 위치(V2에서 고친 결함): 예전에는 SVG 밖 별도 행(`.qbrow.eps`)에 7.5px로 표시해 "어느
 * 점의 값인지 대응이 멀다"는 문제가 있었다 — 이제 각 점 바로 위(SVG 안)에 라벨을 붙인다.
 */

export type LineChartPoint = {
  label: string;
  /** state가 있으면 생략 가능(무시된다) — 기존 계약과의 호환을 위해 옵셔널로만 완화. */
  value?: number | null;
  provisional?: boolean;
  /**
   * 값 대신 표시할 상태 칩 텍스트. 지정되면 value는 무시하고 선을 끊는다. `MetricValue`의
   * `renderText()`가 만드는 문구("흑자전환"/"적자전환"/"적자지속" 등)를 그대로 전달할 것 —
   * 여기서 새 문구를 짓지 말 것(위 컴포넌트 doc 참고).
   */
  state?: string;
};

export type LineChartProps = {
  points: LineChartPoint[];
  /** 도메인에 반드시 포함되는 기준선. label을 주면 차트 아래에 문구로 표시된다. */
  baseline?: { value: number; label?: string };
  /** 선·점 색상(CSS 색상 값 또는 `var(--token)`). 기본 `--green`. */
  color?: string;
  /** 값 뒤에 붙는 단위 접미사 (예: "%", "배"). */
  unit?: string;
  /** true면 양수 값 앞에 `+`를 붙인다. */
  sign?: boolean;
};

type Row = {
  label: string;
  /** 항상 유효한 숫자(dataKey) — 실값 또는 sentinel(도메인 중앙값). `drawable`로 실값 여부를 구분한다. */
  value: number;
  /** 실제로 그릴 수 있는 값(true)인지 sentinel로 채운 결측/상태 지점(false)인지. */
  drawable: boolean;
  /** 라벨·부호 계산용 실값(결측·상태면 null) — `value`는 sentinel일 수 있어 별도로 둔다. */
  displayValue: number | null;
  provisional: boolean;
  state: string | null;
};

const isRowDrawable = (row: Row) => row.drawable;
const isRowProvisional = (row: Row) => row.provisional;

function renderLineShape(props: LineDrawShapeProps, ctx: { runs: ReturnType<typeof splitLineRuns>; strokeColor: string }): ReactElement {
  const points = props.points ?? [];
  return (
    <g>
      {ctx.runs.map((run, i) => {
        const slice = points.slice(run.startIndex, run.endIndex + 1);
        return (
          <polyline
            key={i}
            points={slice.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={run.dashed ? PROVISIONAL : ctx.strokeColor}
            strokeWidth={2.2}
            strokeDasharray={run.dashed ? "4 3" : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

/**
 * `Dots`(recharts 내부)는 결측이어도 dot 콜백을 무조건 호출한다(필터링 없이 `points.map`) —
 * `Bar shape`와 같은 성질(task-V1-report.md §8-1). `payload.drawable`로 실값/sentinel을
 * 구분해 실값이면 점+라벨을, sentinel이면 상태 칩 또는 결측 마커를 그린다.
 */
function renderDot(props: DotItemDotProps, ctx: { strokeColor: string; unit?: string; sign?: boolean }): ReactElement | null {
  const { cx, cy, payload } = props;
  const row = payload as Row;
  if (cx === undefined || cy === undefined) return null;

  if (row.drawable) {
    const value = row.displayValue as number;
    const negative = value < 0;
    const r = row.provisional ? 5 : 4;
    const text = `${ctx.sign && value > 0 ? "+" : ""}${formatComma(value)}${ctx.unit ?? ""}`;
    return (
      <g key={`dot-${row.label}`}>
        <circle cx={cx} cy={cy} r={r} fill={PAPER} stroke={row.provisional ? PROVISIONAL : ctx.strokeColor} strokeWidth={row.provisional ? 2 : 1.8} />
        <ValueLabel x={cx} y={cy} text={text} tone={row.provisional ? "provisional" : negative ? "negative" : "default"} place="above" />
      </g>
    );
  }

  if (row.state) {
    return <StateChip key={`chip-${row.label}`} cx={cx} y={cy} text={row.state} tone="filled" />;
  }
  return (
    <g key={`missing-${row.label}`}>
      <MissingMarker x={cx - 8} y={cy} width={16} />
      <ValueLabel x={cx} y={cy} text={NULL_PLACEHOLDER} tone="missing" place="above" />
    </g>
  );
}

export default function LineChart({ points, baseline, color, unit, sign }: LineChartProps): ReactElement {
  const strokeColor = color || GREEN;

  const displayValues = points.map((p) => (p.state ? null : (p.value ?? null)));
  const definedValues = displayValues.filter((v): v is number => v !== null);
  const hasDrawablePoints = definedValues.length > 0;

  // 도메인: 데이터 범위 25% 여백(학습가이드 line()) 우선 계산 → baseline은 필요할 때만
  // 도메인을 "확장"한다(학습가이드 원본처럼 threshold를 먼저 접고 나서 패딩하면 baseline이 먼
  // 값(부채비율 100%)일 때 패딩 자체가 커져 데이터 쪽 해상도가 더 줄어든다 — task-V2-brief.md
  // "기준선을 포함하되 데이터 쪽 해상도를 확보" 지시).
  let rawMin: number;
  let rawMax: number;
  if (hasDrawablePoints) {
    const dataMin = Math.min(...definedValues);
    const dataMax = Math.max(...definedValues);
    const span = dataMax - dataMin;
    const pad = span > 0 ? span * 0.25 : Math.max(Math.abs(dataMax) * 0.25, 1);
    rawMin = dataMin - pad;
    rawMax = dataMax + pad;
  } else {
    // 그릴 수 있는 값이 0개(전 구간 state) — baseline이 있으면 그 주변에, 없으면 임의 [0,1].
    rawMin = baseline ? baseline.value - 1 : 0;
    rawMax = baseline ? baseline.value + 1 : 1;
  }
  if (baseline) {
    rawMin = Math.min(rawMin, baseline.value);
    rawMax = Math.max(rawMax, baseline.value);
  }
  const domain = niceDomain([rawMin, rawMax]);
  const domainMid = (domain[0] + domain[1]) / 2;

  const rows: Row[] = points.map((p, i) => {
    const displayValue = displayValues[i];
    return {
      label: p.label,
      value: displayValue ?? domainMid,
      drawable: displayValue !== null,
      displayValue,
      provisional: Boolean(p.provisional),
      state: p.state ?? null,
    };
  });
  const runs = splitLineRuns(rows, isRowDrawable, isRowProvisional);
  const hasProvisional = points.some((p) => p.provisional);

  return (
    <div data-chart="line-chart">
      <div className="chart-plot chart-plot--line">
        <ResponsiveContainer width="100%" height="100%">
          {/* right/left 여백은 막대류(8/4)보다 넓다 — 값 라벨이 점 중심에 좌우대칭으로 붙는
              꺾은선 특성상 맨 끝 지점(예: "+69.159%")의 라벨 절반이 SVG 경계를 넘어가 잘리는
              문제가 실측(브라우저 DOM getBoundingClientRect)으로 확인됐다. */}
          <RechartsLineChart data={rows} margin={{ top: 24, right: 40, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_LINE} />
            <XAxis
              dataKey="label"
              tick={{ fill: AXIS_TEXT, fontSize: LABEL_FONT_SIZE_MIN }}
              tickLine={{ stroke: GRID_LINE }}
              axisLine={{ stroke: GRID_LINE }}
              tickMargin={6}
              height={28}
              interval={0}
            />
            <YAxis
              domain={domain}
              tick={{ fill: AXIS_TEXT, fontSize: LABEL_FONT_SIZE_MIN }}
              tickLine={{ stroke: GRID_LINE }}
              axisLine={false}
              tickFormatter={(v: number) => `${formatComma(v)}${unit ?? ""}`}
              width={52}
            />
            {baseline && <ReferenceLine y={baseline.value} stroke={LOSS} strokeWidth={1.2} strokeDasharray="4 3" />}
            <Line
              data={rows}
              dataKey="value"
              shape={(props: LineDrawShapeProps) => renderLineShape(props, { runs, strokeColor })}
              dot={(props: DotItemDotProps) => renderDot(props, { strokeColor, unit, sign })}
              activeDot={false}
              isAnimationActive={false}
              legendType="none"
            />
            {!hasDrawablePoints && (
              // y="20%": 상태 칩은 항상 domainMid(도메인 중앙, SVG상 대략 세로 중앙)에 그려지므로
              // 안내 문구를 정확히 세로 중앙(50%)에 두면 칩 행과 겹친다(실측 확인, 헬릭스미스
              // QoQ 전 구간 적자지속) — 플롯 상단 쪽으로 띄워 겹침을 피한다.
              <text x="50%" y="20%" textAnchor="middle" dominantBaseline="middle" fontSize={LABEL_FONT_SIZE_MIN} fontWeight={700} fill={MUTED_TEXT}>
                전 구간 전환 상태 — 표시할 수치 없음
              </text>
            )}
          </RechartsLineChart>
        </ResponsiveContainer>
      </div>
      {baseline?.label && <div className="cnote">{baseline.label}</div>}
      {hasProvisional && <div className="cnote">실선 확정 · 점선 잠정 구간</div>}
    </div>
  );
}
