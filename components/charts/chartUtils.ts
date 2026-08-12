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
