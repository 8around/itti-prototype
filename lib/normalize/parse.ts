/**
 * DART 응답의 금액/지표 문자열 → 숫자 공통 파서.
 * 결측 표현 3종(""/"-"/"#########")은 API·엔드포인트를 막론하고 전부 null이다 (#3 #4 #41).
 * `idx_val` 키 자체가 없는 경우(v === undefined, #40)도 이 함수로 흡수된다.
 */
export function parseAmount(v?: string | null): number | null {
  if (v == null) return null;
  const s = v.trim();
  if (s === "" || s === "-" || s === "#########") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** derivation 문자열 기록용 천단위 콤마 포맷터. */
export function formatAmount(n: number): string {
  return n.toLocaleString("en-US");
}
