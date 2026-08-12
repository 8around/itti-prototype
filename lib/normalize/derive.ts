/**
 * 파생 지표 계산기 — 이미 resolve된 `Resolution`들을 입력으로 받아 새 `Resolution`을 만든다.
 * 두 입력 중 하나라도 `normalized === null`이면 MISSING, 비율 지표는 분모 ≤ 0이면 NA_NEGATIVE_BASE.
 */

import { formatAmount } from "./parse";
import { PARSER_VERSION } from "./types";
import type { Resolution } from "./types";

function baseOf(metricKey: string, from: Resolution) {
  return {
    metricKey,
    attempts: [] as Resolution["attempts"],
    fsDiv: from.fsDiv,
    fsDivFallbackApplied: from.fsDivFallbackApplied,
    parserVersion: PARSER_VERSION,
  };
}

/**
 * Q4 역산 = 11011.thstrm_amount − 11014.thstrm_add_amount (#39).
 * BS(시점 데이터)는 호출부에서 애초에 이 함수를 쓰지 않는다 — IS/CIS 흐름 계정만 대상.
 */
export function deriveQ4(metricKey: string, annual: Resolution, q3Cumulative: Resolution): Resolution {
  const base = baseOf(metricKey, annual);
  if (annual.normalized === null || q3Cumulative.normalized === null) {
    return { ...base, normalized: null, displayState: "MISSING" };
  }
  const value = annual.normalized - q3Cumulative.normalized;
  return {
    ...base,
    normalized: value,
    displayState: "OK",
    derivation: `Q4 = ${formatAmount(annual.normalized)} − ${formatAmount(q3Cumulative.normalized)}`,
  };
}

function ratioMetric(
  metricKey: string,
  numerator: Resolution,
  denominator: Resolution,
  scale: number,
  label: string,
): Resolution {
  const base = baseOf(metricKey, numerator);
  if (numerator.normalized === null || denominator.normalized === null) {
    return { ...base, normalized: null, displayState: "MISSING" };
  }
  if (denominator.normalized <= 0) {
    return { ...base, normalized: null, displayState: "NA_NEGATIVE_BASE" };
  }
  const value = (numerator.normalized / denominator.normalized) * scale;
  return {
    ...base,
    normalized: value,
    displayState: "OK",
    derivation: `${label} = ${formatAmount(numerator.normalized)} ÷ ${formatAmount(denominator.normalized)} × ${scale}`,
  };
}

/** ROA = 당기순이익 ÷ 자산총계 × 100. `M212000`(총자산영업이익률)은 영업이익 기준이라 ROA가 아니다. */
export function deriveRoa(netIncome: Resolution, totalAssets: Resolution): Resolution {
  return ratioMetric("roa", netIncome, totalAssets, 100, "ROA(%)");
}

/**
 * 영업이익률 = 영업이익 ÷ 매출액 × 100.
 * 금융 프로필의 `NOT_IN_PROFILE` 판정은 T7 소관 — T4는 매출액이 NO_ROW인 회사는 그대로 MISSING을
 * 반환한다(입력값 자체가 없으므로). 결과적으로 revenue가 없는 금융업은 이 지표도 MISSING이 된다.
 */
export function deriveOperatingMargin(operatingIncome: Resolution, revenue: Resolution): Resolution {
  return ratioMetric("operating_margin", operatingIncome, revenue, 100, "영업이익률(%)");
}

/** FCF = 영업활동현금흐름 − CAPEX. FCF 자체는 음수여도 정상값이므로 NA_NEGATIVE_BASE 대상이 아니다. */
export function deriveFcf(operatingCf: Resolution, capex: Resolution): Resolution {
  const base = baseOf("fcf", operatingCf);
  if (operatingCf.normalized === null || capex.normalized === null) {
    return { ...base, normalized: null, displayState: "MISSING" };
  }
  const value = operatingCf.normalized - capex.normalized;
  return {
    ...base,
    normalized: value,
    displayState: "OK",
    derivation: `FCF = ${formatAmount(operatingCf.normalized)} − ${formatAmount(capex.normalized)}`,
  };
}
