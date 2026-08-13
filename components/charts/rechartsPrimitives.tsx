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
 * 양수 값을 "보기 좋은" 다음 자리로 올림한다(1/2/5 × 10^n 계열 — d3·matplotlib 등이 쓰는 표준
 * "nice number" 규칙). Y축 눈금이 `1,539,544.606` 같은 지저분한 수 대신 `2,000,000`처럼 딱
 * 떨어지는 수에서 시작하게 하려고 쓴다.
 */
function niceCeilPositive(value: number): number {
  if (value <= 0) return 0;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * 10 ** exponent;
}

/** `niceCeilPositive`의 반대 방향 — 양수 값을 "보기 좋은" 이전 자리로 내림한다. */
function niceFloorPositive(value: number): number {
  if (value <= 0) return 0;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  const niceFraction = fraction >= 5 ? 5 : fraction >= 2 ? 2 : 1;
  return niceFraction * 10 ** exponent;
}

function niceCeilSigned(value: number): number {
  if (value === 0) return 0;
  return value > 0 ? niceCeilPositive(value) : -niceFloorPositive(-value);
}

function niceFloorSigned(value: number): number {
  if (value === 0) return 0;
  return value > 0 ? niceFloorPositive(value) : -niceCeilPositive(-value);
}

/**
 * `zeroInclusiveDomain`이 계산한 [min,max]를 Recharts `YAxis domain`에 바로 쓸 수 있는 "보기
 * 좋은" 경계로 확장한다. 데이터 최댓값을 그대로 도메인 상한으로 쓰면(예: `domain={[0, 938373]}`)
 * Recharts가 그 값을 도메인 "끝"으로 취급해 눈금 하나를 정확히 그 값에 찍는다 — `domain`이
 * 리터럴 숫자일 때는 `'auto'`일 때와 달리 "nice tick" 반올림을 하지 않기 때문이다(Recharts
 * YAxis 문서: "auto"일 때만 comprehensible한 눈금을 계산한다고 명시). `niceCeil`로 직접
 * 반올림해서 넘기면 이 문제를 피하면서, 값 라벨이 막대 "밖"(위/아래)에 그려질 여백도 자연히
 * 확보된다(반올림 자체가 데이터보다 큰 수로 올라가므로 별도 퍼센트 패딩이 필요 없다).
 */
export function padDomain([min, max]: [number, number]): [number, number] {
  const top = max > 0 ? niceCeilPositive(max) : 0;
  const bottom = min < 0 ? -niceCeilPositive(-min) : 0;
  return [bottom, top];
}

/**
 * `padDomain`은 발산 막대 전용이라 하단을 항상 0으로 고정한다(0을 지나는 도메인이 전제). 꺾은선은
 * 0을 지나지 않는 도메인이 흔하므로(ROE 8~12%처럼 전 구간 양수, 또는 threshold가 데이터에서 먼
 * 부채비율처럼 하단이 0이 아닌 값이어야 함) 양 끝을 각각 독립적으로 내림/올림한다.
 *
 * `min === max`(포인트가 1개뿐이거나 전 구간 같은 값)면 0으로 나누기를 피하려고 값의 25%(0이면
 * 최소 1)를 임시 여백으로 반영한 뒤 반올림한다.
 */
export function niceDomain([min, max]: [number, number]): [number, number] {
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.25, 1);
    return [niceFloorSigned(min - pad), niceCeilSigned(max + pad)];
  }
  return [niceFloorSigned(min), niceCeilSigned(max)];
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
