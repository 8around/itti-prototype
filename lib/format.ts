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

/** 1조 = 10,000억. `formatKrwCompact`의 자리올림 기준. */
const EOK_PER_JO = 10_000;

/**
 * 금액 표시 정밀도 — 억 자리 아래로 몇 자리까지 보여줄지. `0`이 기본(억 단위 반올림)이고,
 * `"won"`은 반올림 없이 원 단위 그대로다.
 *
 * 이 축이 생긴 이유는 `lib/derivationText.ts`의 산식 패널 하나다(V6 최종 리뷰 Critical). 피연산자와
 * 결과를 각자 억 자리에서 반올림하면 **화면에 찍힌 숫자로 계산했을 때 화면에 찍힌 결과가 나오지
 * 않는다** — 최악의 형태가 `4억 − 4억 = −9.7%`다. 산식 패널은 결과를 재현할 수 있는 최소 정밀도를
 * 골라서(`pickStepPrecision`) 피연산자에만 이 값을 올린다. 결과값·`MetricValue`·차트 라벨은 전부
 * 기본값 `0`을 그대로 쓴다.
 */
export type KrwPrecision = number | "won";

/**
 * v3 V5 — 원 단위 raw 금액을 사람이 읽는 한글 단위로 축약한다: `6조 4,927억` / `4,927억` / `1,116원`.
 *
 * 산식 설명 레이어의 존재 이유가 여기 있다. 엔진이 남기는 `derivation` 문자열은
 * `300,870,903,000,000`처럼 원 단위 raw 숫자라 사람이 자릿수를 셀 수 없어 "설명"이 되지 않는다.
 *
 * - 1억 미만은 억으로 접지 않고 원 단위 그대로 둔다. EPS(주당 1,116원)처럼 단위가 KRW로
 *   선언돼 있지만 억 환산이 오표기가 되는 값을 같은 함수로 안전하게 다루기 위해서다
 *   (`MetricValue`의 "WON" 단위 관례와 같은 취지).
 * - 억 자리에서 먼저 반올림한 뒤 조/억을 가른다 — 조와 억을 따로 반올림하면 `6조 10,000억`
 *   같은 자리올림 실패가 난다.
 * - `precision`(V6)은 그 반올림 자리를 억 아래로 내린다: `1` → `51조 4,063.6억`,
 *   `"won"` → `338,264,000원`. 기본값 `0`은 이 인자가 생기기 전과 **바이트 단위로 동일**하다.
 */
export function formatKrwCompact(value: number, precision: KrwPrecision = 0): string {
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (precision === "won" || abs < EOK) return `${sign}${Math.round(abs).toLocaleString("ko-KR")}원`;
  const totalEok = roundTo(abs / EOK, precision);
  const jo = Math.trunc(totalEok / EOK_PER_JO);
  // 조를 떼고 남은 억은 부동소수 잔차(4,063.5499999…)를 갖기 쉬워 표시 자릿수로 한 번 더 접는다.
  const restEok = roundTo(totalEok - jo * EOK_PER_JO, precision);
  const restText = restEok.toLocaleString("ko-KR", { minimumFractionDigits: precision, maximumFractionDigits: precision });
  if (jo === 0) return `${sign}${restText}억`;
  return restEok === 0 ? `${sign}${jo.toLocaleString("ko-KR")}조` : `${sign}${jo.toLocaleString("ko-KR")}조 ${restText}억`;
}

/**
 * `formatKrwCompact`가 그 정밀도로 찍은 문자열을 **읽는 사람이 집어 드는 숫자**(원 단위). 산식
 * 패널이 "화면 숫자로 접으면 화면 결과가 나오는가"를 검사할 때 쓴다 — 포맷터와 반드시 같은
 * 반올림을 해야 하므로 바로 옆에 둔다(둘 중 하나만 고치면 검사가 거짓말을 한다).
 */
export function shownKrwValue(value: number, precision: KrwPrecision = 0): number {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  if (precision === "won" || abs < EOK) return sign * Math.round(abs);
  return sign * roundTo(abs / EOK, precision) * EOK;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** 비율 표기 — 소수 1자리. `MetricValue`의 PCT 포맷과 자릿수를 일부러 맞춘다(같은 값이 두 자리에서 달리 보이면 안 된다). */
export function formatPct(value: number): string {
  return `${value.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
