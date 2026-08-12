/**
 * 차트 프리미티브 공용 헬퍼 — 전부 순수 함수. 8종 프리미티브가 전부 서버 컴포넌트이므로
 * (`"use client"` 없음) 이 모듈도 클라이언트 번들에 포함되지 않는다.
 */

/** 3자리 콤마 포맷. 반올림은 호출부 책임 — 여기서는 그대로 표기한다. */
export function formatComma(value: number): string {
  return value.toLocaleString("ko-KR");
}

/**
 * 차트 하나에 쓸 소수 자릿수를 **그 차트의 값 전체를 보고 한 번에** 정한다.
 *
 * 원 단위 금액을 억원으로 바꾸면(`toEok`) 719156.0132…처럼 의미 없는 소수가 딸려 온다.
 * 719,156.01억원에서 소수 두 자리는 100만원 단위라 아무 정보도 주지 못하면서 라벨만 길게
 * 만들어 막대끼리 겹치게 한다. 반대로 소형주 매출(3.02억)처럼 값이 작을 때는 소수를 지우면
 * 정보가 사라진다.
 *
 * **값마다 따로 판정하면 안 된다** — 신라젠 분기 매출(3.02 / 8.07 / 12.9 / 15.3 …)처럼 10 경계를
 * 걸치는 시계열에서 막대마다 자릿수가 달라져 나란히 놓인 숫자가 어긋나 보인다. 그래서 최대
 * 절대값 하나로 차트 전체의 자릿수를 결정하고, 모든 라벨에 같은 값을 적용한다.
 */
export function chartDigits(values: (number | null)[]): number {
  const max = Math.max(0, ...values.filter((v): v is number => v !== null).map(Math.abs));
  return max >= 1000 ? 0 : max >= 10 ? 1 : 2;
}

/** 차트 값 라벨 포맷. `digits`는 `chartDigits`로 차트 단위에서 한 번 계산해 넘긴다. */
export function formatChartValue(value: number, digits = 0): string {
  return value.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
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
