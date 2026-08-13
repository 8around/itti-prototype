/**
 * 차트 프리미티브 공용 헬퍼 — 전부 순수 함수. 8종 프리미티브가 전부 서버 컴포넌트이므로
 * (`"use client"` 없음) 이 모듈도 클라이언트 번들에 포함되지 않는다.
 */

/** 3자리 콤마 포맷. 반올림은 호출부 책임 — 여기서는 그대로 표기한다. */
export function formatComma(value: number): string {
  return value.toLocaleString("ko-KR");
}

/** 소수 1자리 % 포맷. */
export function formatPct1(value: number): string {
  return `${value.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 극좌표 → 직교좌표. angleDeg는 12시 방향을 0°로 하는 시계방향 각도(SVG 좌표계, y down). */
export function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: round2(cx + r * Math.cos(rad)), y: round2(cy + r * Math.sin(rad)) };
}

/**
 * 파이 슬라이스 하나의 SVG arc path. 목업(`.piesvg`)의 `M cx,cy L x,y A r,r 0 largeArc 1 x,y Z`
 * 패턴과 동일 — largeArc는 180°를 넘는 슬라이스에서만 1.
 */
export function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M${cx},${cy} L${start.x},${start.y} A${r},${r} 0 ${largeArc} 1 ${end.x},${end.y} Z`;
}

/** 차트 팔레트(--chart-1..5) 토큰을 인덱스로 순환 참조. */
export const CHART_PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"] as const;

/** null 값 자리에 쓰는 플레이스홀더 텍스트 — 근거 없는 0 대신 명시적으로 "없음"을 표기. */
export const NULL_PLACEHOLDER = "—";

/** 0축 막대 3종(ZeroAxisBars·SignedGroupedBars·OverlaidBars)이 공유하는 세로 예산(px). */
export const SIGNED_AXIS_TOTAL_PX = 82;

export type SignedAxisScale = {
  /** 기준선 위 영역 높이(px). */
  topPx: number;
  /** 기준선 아래 영역 높이(px). */
  botPx: number;
  /** 값의 막대 높이(px). 부호와 무관하게 |value| × 같은 배율이다. */
  heightPx: (value: number) => number;
};

/**
 * 0축 막대의 위/아래 영역 높이와 막대 높이를 한 배율로 계산한다.
 *
 * 최종 리뷰 픽스(I1): 예전에는 위 56px·아래 26px 고정 영역에 `|value|/max × 100%`를 **양쪽 똑같이**
 * 적용해서, 크기가 같은 +100과 −100이 56px과 26px로 그려졌다(2.15배 차이). 삼성전자 24년 현금흐름은
 * 투자CF −85.38조가 영업CF +72.98조보다 큰데도 막대는 영업이 1.8배 커 보였다 — 승인 규칙 2의 문자
 * ("손실은 아래")는 지키면서 의도(손실 크기를 정직하게)를 깨뜨리던 자리다.
 *
 * 지금은 전체 예산 `totalPx`를 양수 최댓값과 음수 최댓값의 **크기 비율대로 갈라** 위/아래에
 * 배분하므로 px per unit이 위아래 동일하다(`heightPx(maxPos) === topPx`, `heightPx(-maxNeg) === botPx`).
 * 전부 양수면 아래 영역이 0이 되어 기준선이 바닥에 놓이고 막대가 예산 전체를 쓴다 — 컬럼 총 높이는
 * 부호 구성과 무관하게 항상 `totalPx`라 레이아웃이 흔들리지 않는다.
 */
export function signedAxisScale(values: (number | null)[], totalPx: number = SIGNED_AXIS_TOTAL_PX): SignedAxisScale {
  const defined = values.filter((v): v is number => v !== null);
  const maxPositive = Math.max(0, ...defined);
  const maxNegative = Math.max(0, ...defined.map((v) => -v));
  const span = maxPositive + maxNegative;
  if (span <= 0) return { topPx: totalPx, botPx: 0, heightPx: () => 0 };
  const perUnit = totalPx / span;
  return {
    topPx: maxPositive * perUnit,
    botPx: maxNegative * perUnit,
    heightPx: (value: number) => Math.abs(value) * perUnit,
  };
}

/** 소수점이 길어지지 않게 다듬은 px 문자열 — 인라인 style용. */
export function px(value: number): string {
  return `${Math.round(value * 10) / 10}px`;
}

export type Xy = { x: number; y: number };
export type LineRun = { pts: Xy[]; dashed: boolean };

/**
 * 꺾은선을 실선/점선 run으로 자른다(`LineChart` 전용 기하 계산이지만 순수 함수라 여기 둔다).
 *
 * 최종 리뷰 픽스(M5): 판정 단위는 **인접 두 지점을 잇는 구간**이고, 양 끝 중 하나라도 잠정이면 그
 * 구간이 점선이다. 예전에는 "첫 잠정 지점 이후 끝까지 전부 점선"이라 뒤쪽이 연속 구간이라고
 * 가정했는데, 8분기 윈도에는 Q4가 둘 들어갈 수 있어(2024Q4·2025Q4) 첫 Q4 뒤의 확정 분기까지
 * 잠정으로 오염된다.
 *
 * 같은 종류가 연속되면 하나의 run으로 묶어 대시 위상이 끊기지 않게 하고, 종류가 바뀌는 자리에서는
 * 두 run이 같은 꼭짓점을 공유해 선에 틈이 생기지 않는다. 값이 null인 지점에서는 run을 끊는다.
 */
export function buildLineRuns(xs: number[], ys: (number | null)[], provisional: boolean[]): LineRun[] {
  const runs: LineRun[] = [];
  let pts: Xy[] = [];
  let dashed = false;
  const flush = () => {
    if (pts.length > 1) runs.push({ pts, dashed });
    pts = [];
  };
  for (let i = 0; i + 1 < xs.length; i++) {
    const y0 = ys[i];
    const y1 = ys[i + 1];
    if (y0 === null || y1 === null) {
      flush();
      continue;
    }
    const segmentDashed = Boolean(provisional[i] || provisional[i + 1]);
    if (pts.length === 0 || segmentDashed !== dashed) {
      flush();
      pts = [{ x: xs[i], y: y0 }];
      dashed = segmentDashed;
    }
    pts.push({ x: xs[i + 1], y: y1 });
  }
  flush();
  return runs;
}
