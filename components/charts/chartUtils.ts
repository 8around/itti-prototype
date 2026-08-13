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

/** null 값 자리에 쓰는 플레이스홀더 텍스트 — 근거 없는 0 대신 명시적으로 "없음"을 표기. */
export const NULL_PLACEHOLDER = "—";

// V3 — polarToCartesian/describeArc/CHART_PALETTE 퇴역. PieChart.tsx가 수동 SVG arc 계산을
// Recharts 네이티브 <Pie>로, CHART_PALETTE(hue 미분리 5색)를 CATEGORY_PALETTE(chartTheme.ts,
// hue 분리 5색)로 교체하며 마지막 소비자(PieChart·StackedBar100)가 사라졌다 — 잔존 참조 0건
// 재확인(`grep -rn "describeArc\|polarToCartesian\|CHART_PALETTE" components app`).
// task-V2-report.md §3(signedAxisScale 등 퇴역)과 동일한 정리 규칙.
