import type { ReactElement } from "react";

import { AXIS_TEXT, CHIP_BG, LABEL_FONT_SIZE_MIN, LOSS, MUTED_TEXT, PROVISIONAL, VALUE_LABEL_COLOR, VALUE_LABEL_FONT_WEIGHT } from "./chartTheme";

/**
 * Recharts 커스텀 `Bar shape` 공용 SVG 조각 — V1(막대 3종: ZeroAxisBars·StackedBarsAbs·
 * OverlaidBars)이 처음 만들고 V2·V3(선·오버레이 계열)도 같은 패턴을 재사용할 것을 염두에 뒀다.
 * 전부 순수 렌더 함수(상태·훅 없음)라 서버/클라이언트 어느 쪽에서 import해도 안전하지만, 실제
 * 사용처는 전부 `'use client'` 차트 컴포넌트의 `Bar shape={...}` 콜백 안이다.
 *
 * 색·치수는 전부 `chartTheme.ts`에서만 가져온다 — 여기에 hex나 `var(--x)` 문자열을 직접 쓰지
 * 말 것(V0·global-constraints.md 규칙과 동일).
 */

export type ValueLabelTone = "default" | "negative" | "provisional" | "missing";

/**
 * 막대 값 라벨(숫자). `place="above"`면 y 위쪽(막대 밖)에, `"below"`면 y 아래쪽에 그린다 — 0축
 * 위(양수) 막대는 above, 아래(음수) 막대는 below로 호출하는 게 일반적이다. textAnchor="middle"
 * 고정이라 호출부는 막대 중심 x만 넘기면 된다.
 */
export function ValueLabel({
  x,
  y,
  text,
  tone = "default",
  place = "above",
}: {
  x: number;
  y: number;
  text: string;
  tone?: ValueLabelTone;
  place?: "above" | "below";
}): ReactElement {
  const color = tone === "negative" ? LOSS : tone === "provisional" ? PROVISIONAL : tone === "missing" ? MUTED_TEXT : VALUE_LABEL_COLOR;
  const dy = place === "above" ? -6 : LABEL_FONT_SIZE_MIN + 4;
  return (
    <text x={x} y={y + dy} textAnchor="middle" fontSize={LABEL_FONT_SIZE_MIN} fontWeight={VALUE_LABEL_FONT_WEIGHT} fill={color}>
      {text}
    </text>
  );
}

/**
 * 상태 칩("무배당"/"—" 등). `tone="filled"`면 배경 필(pill) + 텍스트(기존 `.pchip`/`.obchip`과
 * 동일 배색), `tone="muted"`면 배경 없이 텍스트만(기존 `.obchip.muted` — 데이터 없음 "—"용,
 * 존재감을 죽여 "낮은 값"으로 오독되지 않게 한다).
 *
 * 승인 규칙 4(배당 0원 vs 데이터 없음)를 텍스트로 구분하는 유일한 수단이 이 칩이다 — 두 경우
 * 모두 막대 높이가 0이라 칩이 없으면 시각적으로 구별이 안 된다.
 */
export function StateChip({ cx, y, text, tone = "filled" }: { cx: number; y: number; text: string; tone?: "filled" | "muted" }): ReactElement {
  if (tone === "muted") {
    return (
      <text x={cx} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={LABEL_FONT_SIZE_MIN} fontWeight={VALUE_LABEL_FONT_WEIGHT} fill={MUTED_TEXT}>
        {text}
      </text>
    );
  }
  // 정밀한 텍스트 폭 측정 대신 글자 수 기반 근사치를 쓴다(SSG 서버에 캔버스가 없어 측정 API를
  // 못 쓴다) — 여유 있게 잡아 실제 텍스트가 필보다 좁게 나오는 쪽으로 오차를 둔다.
  const w = text.length * 7.4 + 10;
  const h = LABEL_FONT_SIZE_MIN + 6;
  return (
    <g>
      <rect x={cx - w / 2} y={y - h / 2} width={w} height={h} rx={h / 2} fill={CHIP_BG} />
      <text x={cx} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={LABEL_FONT_SIZE_MIN} fontWeight={VALUE_LABEL_FONT_WEIGHT} fill={AXIS_TEXT}>
        {text}
      </text>
    </g>
  );
}

/**
 * 결측(null) 자리 표시 — 근거 없는 0 대신 얇은 가로 마커만 그린다(막대를 렌더하지 않는다는
 * 원칙은 유지하되, 컬럼이 완전히 빈 것과 "확인했지만 없음"을 구분하려고 최소한의 시각 요소는
 * 남긴다). "—" 텍스트는 호출부가 `ValueLabel tone="missing"`으로 별도 렌더한다.
 */
export function MissingMarker({ x, y, width }: { x: number; y: number; width: number }): ReactElement {
  return <rect x={x} y={y - 1} width={width} height={2} rx={1} fill={MUTED_TEXT} opacity={0.5} />;
}

/**
 * 0을 항상 포함하는 선형 도메인. 전부 양수/음수여도 0이 도메인에 들어가 기준선(ReferenceLine
 * y=0)이 항상 플롯 안에 존재하게 한다 — `signedAxisScale`이 하던 일 중 "0을 항상 포함" 부분만
 * 남고, px 배분 자체는 Recharts의 실제 선형 스케일에 맡긴다(위/아래 px-per-unit 대칭이 스케일
 * 자체의 성질이라 별도 계산이 필요 없어졌다).
 */
export function zeroInclusiveDomain(values: Array<number | null | undefined>): [number, number] {
  const defined = values.filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
  const max = Math.max(0, ...defined);
  const min = Math.min(0, ...defined);
  return [min, max];
}

/**
 * `Bar background`가 넘겨주는 전체 플롯 사각형(`{x,y,width,height}`, y=도메인 최댓값의 픽셀,
 * height=도메인 전체 스팬의 픽셀)과 도메인을 이용해 임의의 값 → 픽셀 y를 계산한다.
 *
 * 이 함수가 필요한 이유(`OverlaidBars` 전용): 하나의 `<Bar>`는 자신에 바인딩된 dataKey 값의
 * 픽셀 좌표(x,y,width,height)만 받는다. outer(EPS) Bar의 shape 콜백 안에서 inner(DPS) 값의
 * 픽셀도 같은 축으로 그리려면 "같은 스케일"이 필요한데, Recharts는 스케일 함수 자체를 shape
 * props로 넘겨주지 않는다. 대신 `background`(늘 도메인 전체를 덮는 사각형)를 이용하면 Recharts가
 * 실제로 계산한 마진·오프셋을 그대로 활용해 정확한 선형 변환을 재현할 수 있다 — 축약형으로
 * 마진을 직접 다시 계산할 필요가 없다(recharts `Bar.js`의 `background = {x, y: offset.top,
 * width, height: offset.height}` 계산과 대응, node_modules 소스로 확인).
 */
export function pixelForValue(background: { y: number; height: number }, domain: [number, number], value: number): number {
  const [domainMin, domainMax] = domain;
  const span = domainMax - domainMin;
  if (span <= 0) return background.y;
  return background.y + background.height * ((domainMax - value) / span);
}

/**
 * Y축 도메인 + 그 도메인을 정확히 눈금 간격으로 나누는 눈금 개수. 둘은 **반드시 함께** 정해야
 * 한다 — 이유는 아래 `axisScale` doc 참고.
 */
export type AxisScale = { domain: [number, number]; tickCount: number };

/** 눈금 개수 목표. Recharts `tickCount` 기본값과 같은 5에서 출발하고, 경계를 step 배수로 맞추는
 *  과정에서 최대 6까지 늘어난다. */
const TARGET_TICK_COUNT = 5;

/**
 * 눈금 **간격**을 1/2/5 × 10^n 사다리에서 고른다(d3 `tickIncrement`·matplotlib과 같은 규칙).
 *
 * V3까지는 이 사다리를 도메인 **경계**에 직접 적용했는데, 그건 규칙을 잘못 쓴 것이다. 한 자릿수당
 * 단계가 3개뿐이라 경계값이 조금만 넘어가면 도메인이 2~5배로 뛴다(`10.08 → 20`, `51 → 100`).
 * 실측 피해: POSCO홀딩스 부채비율(69.19/68.27/68.64)이 도메인 `[50,100]`으로 계산돼 180px 플롯에서
 * 세로 변동 3.3px = 육안 완전 평선이었고, 연간 꺾은선 54건 중 9건이 스팬 20px 미만이었다.
 * "3개년 추세"를 보여주겠다는 차트가 아무 추이도 보여주지 못한 것이 사용자 원 불만("차트가 안
 * 읽힌다")의 잔존분이다.
 */
function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const exponent = Math.floor(Math.log10(rough));
  const fraction = rough / 10 ** exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * 10 ** exponent;
}

/** `k * step`의 부동소수 잔차(68.99999999999999)를 없앤다 — 경계가 그대로 축 라벨로 나간다. */
function snapToStep(k: number, step: number): number {
  return Number((k * step).toPrecision(12));
}

/**
 * d3 `scale.nice()`와 같은 2단계로 축을 만든다: **간격을 먼저 고르고**(`niceStep`) 경계를 그
 * 간격의 배수로 맞춘다. 반환하는 `tickCount`를 `<YAxis tickCount>`에 그대로 넘겨야 의미가 있다.
 *
 * `tickCount`가 왜 필수인가 — Recharts 3.10.1은 리터럴 숫자 도메인에 대해
 * `getTickValuesFixedDomain(domain, tickCount, ...)`를 호출해 **양 끝을 고정한 채 그 사이를 균등
 * 분할**한다(`node_modules/recharts/es6/state/selectors/axisSelectors.js`). 즉 도메인만 예쁘게
 * 만들고 `tickCount`를 안 주면 기본값 5로 나뉘어 `50 · 65 · 80 · 95 · 100`처럼 **첫/마지막만 딱
 * 떨어지고 중간은 지저분한 데다 마지막 간격만 짧은** 눈금이 나온다. `CartesianGrid`가 그 자리에
 * 선을 그으므로 축이 비선형처럼 보여, 승인규칙 ①(위/아래 px-per-unit 대칭)의 육안 검증까지
 * 무력화한다. 도메인 스팬이 `step × (tickCount-1)`이면 균등 분할이 정확히 step 배수에 떨어진다.
 *
 * `anchorZero`(발산 막대용)면 0을 반드시 도메인에 넣는다. 0은 어떤 step의 배수이기도 하므로 0선이
 * 항상 눈금·격자선과 겹친다 — 승인규칙 ①이 스케일뿐 아니라 격자에서도 지켜진다.
 */
function axisScale(min: number, max: number, anchorZero: boolean): AxisScale {
  let lo = anchorZero ? Math.min(0, min) : min;
  let hi = anchorZero ? Math.max(0, max) : max;
  if (!(hi > lo)) {
    // 스팬 0 — 포인트가 1개뿐이거나 전 구간 같은 값(전부 결측이면 [0,0]으로 들어온다).
    const pad = Math.max(Math.abs(hi) * 0.25, 1);
    hi += pad;
    if (!anchorZero) lo -= pad;
  }
  const step = niceStep((hi - lo) / (TARGET_TICK_COUNT - 1));
  // 경계가 이미 step의 배수면 floor/ceil이 그 자리를 유지하도록 미세 오차를 흡수한다.
  const loK = Math.floor(lo / step + 1e-9);
  const hiK = Math.ceil(hi / step - 1e-9);
  return { domain: [snapToStep(loK, step), snapToStep(hiK, step)], tickCount: hiK - loK + 1 };
}

/**
 * `zeroInclusiveDomain`이 계산한 [min,max]를 발산 막대용 축으로 만든다 — 0을 반드시 포함하고
 * 경계는 눈금 간격의 배수다. 값 라벨이 막대 "밖"(위/아래)에 그려질 여백은 경계 올림이 자연히
 * 만들어 준다(별도 퍼센트 패딩 불필요).
 */
export function padDomain([min, max]: [number, number]): AxisScale {
  return axisScale(min, max, true);
}

/**
 * `padDomain`은 0을 지나는 도메인이 전제다. 꺾은선은 0을 지나지 않는 도메인이 흔하므로
 * (ROE 8~12%처럼 전 구간 양수) 0 고정 없이 양 끝을 눈금 간격의 배수로 맞춘다.
 */
export function niceDomain([min, max]: [number, number]): AxisScale {
  return axisScale(min, max, false);
}

/** 꺾은선 축 — `AxisScale`에 "기준선이 도메인 안에 들어왔는가"가 붙는다. */
export type LineAxisScale = AxisScale & { baselineInDomain: boolean };

/**
 * 기준선을 넣느라 데이터 구간이 플롯의 이 비율 미만으로 눌리면 기준선을 도메인에서 뺀다.
 * 25%는 "데이터가 최소한 플롯의 1/4은 쓴다"는 하한이다.
 */
const MIN_DATA_SHARE = 0.25;

/**
 * 꺾은선 도메인 — 데이터 범위에 25% 여백(학습가이드 `line()`)을 두고 눈금 간격의 배수로 맞춘다.
 * 여백은 값 라벨이 점 바로 위에 그려지는 구조라 필요하다.
 *
 * **기준선(부채비율 100% 등)은 조건부로만 도메인에 넣는다.** 종전에는 무조건 접었는데, 기준선이
 * 데이터에서 멀면 그 하나 때문에 데이터가 통째로 눌렸다 — 신한지주 부채비율(1,128~1,202%)은
 * 기준선 100% 탓에 도메인이 `[100, 2000]`이 되어 3개년 변동이 7px, POSCO홀딩스는 3.3px였다.
 * 데이터 구간이 플롯의 `MIN_DATA_SHARE` 미만으로 눌리면 기준선을 빼고 데이터 해상도를 택한다.
 * 그때 `baselineInDomain: false`가 나가고, 호출부는 기준선을 그리는 대신 "축 범위 밖"임을 문구로
 * 알린다 — 없는 것처럼 감추지 않는다.
 */
export function lineDomain(values: readonly number[], baseline?: number): LineAxisScale {
  if (values.length === 0) {
    const center = baseline ?? 0;
    return { ...niceDomain([center - 1, center + 1]), baselineInDomain: baseline !== undefined };
  }
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const span = dataMax - dataMin;
  const pad = span > 0 ? span * 0.25 : Math.max(Math.abs(dataMax) * 0.25, 1);
  const paddedMin = dataMin - pad;
  const paddedMax = dataMax + pad;

  const dataOnly = niceDomain([paddedMin, paddedMax]);
  if (baseline === undefined) return { ...dataOnly, baselineInDomain: false };
  if (baseline >= dataOnly.domain[0] && baseline <= dataOnly.domain[1]) return { ...dataOnly, baselineInDomain: true };

  const withBaseline = niceDomain([Math.min(paddedMin, baseline), Math.max(paddedMax, baseline)]);
  const share = (paddedMax - paddedMin) / (withBaseline.domain[1] - withBaseline.domain[0]);
  return share >= MIN_DATA_SHARE ? { ...withBaseline, baselineInDomain: true } : { ...dataOnly, baselineInDomain: false };
}

export type LineRun = { startIndex: number; endIndex: number; dashed: boolean };

/**
 * 꺾은선을 실선/점선 run으로 자른다 — `chartUtils.buildLineRuns`(퇴역, V2)의 후신.
 * **인덱스 구간**(원본 행 배열에서 항상 연속된 슬라이스)만 반환한다 — 처음엔 run마다 부분집합
 * `data`를 가진 별도 `<Line>`을 두는 설계였지만, 실측 결과 Recharts가 `<Line>`마다 서로 다른
 * `data`를 주면(길이가 같아도) XAxis 눈금 라벨을 `<Line>` 개수만큼 중복 렌더링하는 현상이
 * 확인됐다(`<Line>` N개 → 라벨 N벌). 대신 **`<Line>` 하나**(전 지점을 포함하는 단일 `data`)의
 * 커스텀 `shape` 콜백 안에서, Recharts가 계산해준 `points` 배열을 이 함수가 반환한 인덱스 구간으로
 * 잘라 run별 `<polyline>`을 직접 그리는 방식으로 바꿨다(V1 `Bar shape` 패턴과 동일한 "그래픽
 * 아이템 1개 + 커스텀 콜백" 구조 — `LineChart.tsx` 참고).
 *
 * 판정 로직은 원본과 동일: 인접 두 행을 잇는 **구간** 단위로 점선 여부를 정하고(양 끝 중 하나라도
 * `isProvisional`이면 그 구간은 점선), 종류가 바뀌는 자리에서는 인접한 두 run이 경계 인덱스를
 * 공유해(`run[i].endIndex === run[i+1].startIndex`) 시각적 틈이 생기지 않는다. `isDrawable`이
 * false인 행(결측·상태 칩)에서는 run이 끊긴다.
 */
export function splitLineRuns<T>(rows: readonly T[], isDrawable: (row: T) => boolean, isProvisional: (row: T) => boolean): LineRun[] {
  const runs: LineRun[] = [];
  let startIndex = -1;
  let endIndex = -1;
  let dashed = false;
  const flush = () => {
    if (startIndex !== -1 && endIndex > startIndex) runs.push({ startIndex, endIndex, dashed });
    startIndex = -1;
    endIndex = -1;
  };
  for (let i = 0; i + 1 < rows.length; i++) {
    if (!isDrawable(rows[i]) || !isDrawable(rows[i + 1])) {
      flush();
      continue;
    }
    const segmentDashed = isProvisional(rows[i]) || isProvisional(rows[i + 1]);
    if (startIndex === -1 || segmentDashed !== dashed) {
      flush();
      startIndex = i;
      dashed = segmentDashed;
    }
    endIndex = i + 1;
  }
  flush();
  return runs;
}

/** 임의 부호의 (y, height)를 SVG `<rect>`에 바로 쓸 수 있는 (top-y, 양수 height)로 정규화한다.
 * Recharts는 음수 값의 막대를 y=값의 픽셀(더 아래) + height=음수로 표현한다(경로 렌더러
 * `getRectanglePath`가 부호를 해석해서 그린다) — 우리가 직접 `<rect>`를 그릴 때는 부호가
 * 있으면 안 되므로 여기서 정규화한다. */
export function normalizeRect(y: number, height: number): { top: number; height: number } {
  return height < 0 ? { top: y + height, height: -height } : { top: y, height };
}
