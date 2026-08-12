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

/* -------------------------------------------------------------------------------------------- */
/* v2 T2 — 분기 축 파생 (CF 단일분기화, QoQ/YoY)                                                  */
/* -------------------------------------------------------------------------------------------- */

/**
 * CF(누적) 단일분기화 = 당기 reprt.thstrm − 직전 reprt.thstrm (T1V 판정2). `deriveQ4`와 같은 뺄셈
 * 형태이지만 ① 피연산자가 둘 다 `thstrm_amount`(CF엔 `thstrm_add_amount` 필드 자체가 없다) ②
 * 대상 분기가 Q2~Q4로 다양해 derivation 라벨을 호출부가 지정한다(예: "Q2(CF)").
 */
export function deriveQuarterCf(metricKey: string, label: string, current: Resolution, prior: Resolution): Resolution {
  const base = baseOf(metricKey, current);
  if (current.normalized === null || prior.normalized === null) {
    return { ...base, normalized: null, displayState: "MISSING" };
  }
  const value = current.normalized - prior.normalized;
  return {
    ...base,
    normalized: value,
    displayState: "OK",
    derivation: `${label} = ${formatAmount(current.normalized)} − ${formatAmount(prior.normalized)}`,
  };
}

/**
 * QoQ/YoY 공용 계산. 승인 규칙(팀리드 브리프): 직전·당기 둘 다 양수일 때만 통상 %를 계산하고,
 * 그 외 3가지 부호 조합은 흑자전환/적자전환/적자지속 상태로 분류한다 — 그 구간은 %가 왜곡되므로
 * (분모가 0에 가깝거나 음수) 숫자를 아예 감추고 상태만 노출한다(NA_NEGATIVE_BASE와 같은 취지).
 */
function deriveGrowth(kind: "QoQ" | "YoY", metricKey: string, current: Resolution, previous: Resolution): Resolution {
  const base = baseOf(metricKey, current);
  if (current.normalized === null || previous.normalized === null) {
    return { ...base, normalized: null, displayState: "MISSING" };
  }
  const cur = current.normalized;
  const prev = previous.normalized;

  if (prev > 0 && cur > 0) {
    const value = ((cur - prev) / Math.abs(prev)) * 100;
    return { ...base, normalized: value, displayState: "OK", derivation: `${kind} = (${formatAmount(cur)} − ${formatAmount(prev)}) ÷ |${formatAmount(prev)}| × 100` };
  }
  if (prev <= 0 && cur > 0) {
    return { ...base, normalized: null, displayState: "TURN_TO_PROFIT", derivation: `${kind} 흑자전환: 직전 ${formatAmount(prev)} → 당기 ${formatAmount(cur)}` };
  }
  if (prev > 0 && cur <= 0) {
    return { ...base, normalized: null, displayState: "TURN_TO_LOSS", derivation: `${kind} 적자전환: 직전 ${formatAmount(prev)} → 당기 ${formatAmount(cur)}` };
  }
  return { ...base, normalized: null, displayState: "LOSS_CONTINUED", derivation: `${kind} 적자지속: 직전 ${formatAmount(prev)} → 당기 ${formatAmount(cur)}` };
}

/** QoQ(전분기 대비) — `metricKey`는 호출부가 `qoq_<key>` 형태로 넘긴다. */
export function deriveQoQ(metricKey: string, current: Resolution, previous: Resolution): Resolution {
  return deriveGrowth("QoQ", metricKey, current, previous);
}

/** YoY(전년 동분기 대비) — `metricKey`는 호출부가 `yoy_<key>` 형태로 넘긴다. */
export function deriveYoY(metricKey: string, current: Resolution, previous: Resolution): Resolution {
  return deriveGrowth("YoY", metricKey, current, previous);
}

/** 비교 대상 분기 자체가 데이터셋에 없을 때(예: 2023Q1의 직전분기 2022Q4) QoQ/YoY 입력으로 쓰는 자리표시 MISSING. */
export function missingResolution(metricKey: string, like: Resolution): Resolution {
  return {
    metricKey,
    attempts: [],
    fsDiv: like.fsDiv,
    fsDivFallbackApplied: like.fsDivFallbackApplied,
    normalized: null,
    displayState: "MISSING",
    parserVersion: PARSER_VERSION,
  };
}
