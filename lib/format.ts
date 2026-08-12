/**
 * 화면 계층 공통 숫자 포맷 헬퍼 (T7). 억 단위 변환을 여기 한 곳에 모아서 MetricValue·차트
 * 프리미티브(PnlWaterfall/StackedBar100 등) 호출부가 전부 같은 상수/함수를 쓰게 한다.
 *
 * `EOK`는 components/SourcePanelClient.tsx(T5)가 이미 쓰는 상수와 동일한 값 — 정의를
 * 반복하되(클라이언트 컴포넌트 번들 경계상 import로 묶지 않음) 값은 반드시 100_000_000으로
 * 맞춰야 한다.
 */
export const EOK = 100_000_000;

/** 원 단위 KRW 값을 억원 단위로 변환한다. MetricValue.value·차트 프리미티브의 value는 전부 억원. */
export function toEok(value: number): number {
  return value / EOK;
}
