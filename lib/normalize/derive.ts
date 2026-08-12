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

/**
 * 순이익률 = 당기순이익 ÷ 매출액 × 100.
 * DART 산출값(M211200)이 있으면 그쪽이 1순위 — 이 함수는 `preferIndx`로 폴백될 때만 쓰인다.
 */
export function deriveNetMargin(netIncome: Resolution, revenue: Resolution): Resolution {
  return ratioMetric("net_margin", netIncome, revenue, 100, "순이익률(%)");
}

/** 매출총이익률 = 매출총이익 ÷ 매출액 × 100. */
export function deriveGrossMargin(grossProfit: Resolution, revenue: Resolution): Resolution {
  return ratioMetric("gross_margin", grossProfit, revenue, 100, "매출총이익률(%)");
}

/**
 * BPS(주당순자산) = 지배주주지분 ÷ 발행주식총수.
 * 자본총계가 아니라 **지배주주지분**을 쓴다 — 비지배지분은 이 회사 주주 몫이 아니다.
 * 자기주식을 차감한 유통주식수가 이론상 더 정확하지만, DART 배당공시(BPS 미제공)와 시장 관행이
 * 발행주식총수 기준이라 그쪽에 맞춘다(자기주식수는 별도 지표로 병기).
 */
export function deriveBps(equityAttributable: Resolution, sharesOutstanding: Resolution): Resolution {
  return ratioMetric("bps", equityAttributable, sharesOutstanding, 1, "BPS(원)");
}

/**
 * 이자보상배율 = 영업이익 ÷ 이자비용. "영업이익으로 이자를 몇 번 갚을 수 있나" — 1배 미만이면
 * 벌어서 이자도 못 낸다는 뜻이라 화면에 1배 임계선을 함께 그린다.
 *
 * 분모가 0이면(무차입 경영) 비율이 무한대라 수치로 표현할 수 없다 — NA_NEGATIVE_BASE로 처리하고
 * 사유를 derivation에 남긴다(ratioMetric의 `denominator <= 0` 분기와 같은 취급).
 */
export function deriveInterestCoverage(operatingIncome: Resolution, interestExpense: Resolution): Resolution {
  const res = ratioMetric("interest_coverage", operatingIncome, interestExpense, 1, "이자보상배율(배)");
  if (res.displayState === "NA_NEGATIVE_BASE") {
    return { ...res, derivation: "이자비용이 0 이하 — 배율 정의 불가(무차입 또는 계정 미공시)" };
  }
  // 어느 계정이 분모로 쓰였는지가 해석을 바꾼다(순수 이자비용 vs 금융비용 폴백).
  const denomAccount = interestExpense.hit?.accountId;
  if (res.displayState === "OK" && denomAccount) {
    return { ...res, derivation: `${res.derivation} · 분모 계정 ${denomAccount}(${interestExpense.hit?.accountNm})` };
  }
  return res;
}

/**
 * 순차입금 = Σ(차입성 부채 계정) − 현금및현금성자산 − 단기금융상품.
 *
 * 폴백 체인(첫 HIT 하나 채택)과 달리 **존재하는 계정을 전부 더한다**. 어떤 계정이 실제로
 * 잡혔는지를 `attempts`(HIT/NO_ROW)와 `derivation`에 남겨, 총차입금이 과소 집계됐는지
 * 화면에서 바로 검증할 수 있게 한다.
 *
 * 차입금 계정이 하나도 안 잡히면 "무차입"과 "우리가 못 읽음"을 구분할 수 없으므로 MISSING이다 —
 * 근거 없는 0을 만들지 않는다(플랜 §8 T10 원칙).
 */
export function deriveNetDebt(
  borrowings: { accountId: string; accountNm: string; value: number }[],
  attempts: Resolution["attempts"],
  cashLike: Resolution[],
  from: Resolution,
): Resolution {
  const base = { ...baseOf("net_debt", from), attempts };
  if (borrowings.length === 0) {
    return { ...base, normalized: null, displayState: "MISSING" };
  }
  const gross = borrowings.reduce((sum, b) => sum + b.value, 0);
  const cash = cashLike.reduce((sum, r) => sum + (r.normalized ?? 0), 0);
  const cashLabels = cashLike.filter((r) => r.normalized != null).map((r) => r.hit?.accountNm ?? r.metricKey);
  return {
    ...base,
    normalized: gross - cash,
    displayState: "OK",
    derivation:
      `순차입금 = 총차입금 ${formatAmount(gross)} − 현금성 ${formatAmount(cash)}` +
      ` · 총차입금 구성(${borrowings.length}개): ${borrowings.map((b) => `${b.accountNm}[${b.accountId}] ${formatAmount(b.value)}`).join(" + ")}` +
      (cashLabels.length > 0 ? ` · 차감 현금성: ${cashLabels.join(" + ")}` : " · 차감할 현금성 계정 없음"),
  };
}

/**
 * 성장률 = (당기 − 전기) ÷ |전기| × 100.
 *
 * **분모에 절대값을 쓴다.** 전기가 적자(음수)일 때 부호를 그대로 두면 "적자가 커졌는데 성장률
 * +"라는 역전이 생긴다. 다만 적자→흑자처럼 부호가 바뀌면 %는 해석 자체가 무의미하므로
 * (학습가이드의 "1Q26은 직전 분기가 적자라 %가 무의미 → 흑자전환" 케이스) 수치 대신
 * NA_NEGATIVE_BASE로 돌려 화면이 "흑자전환/적자전환"으로 표기하게 한다.
 */
export function deriveGrowth(metricKey: string, current: Resolution, previous: Resolution, periodLabel: string): Resolution {
  const base = baseOf(metricKey, current);
  if (current.normalized === null || previous.normalized === null) {
    return { ...base, normalized: null, displayState: "MISSING" };
  }
  if (previous.normalized === 0) {
    return { ...base, normalized: null, displayState: "NA_NEGATIVE_BASE", derivation: `${periodLabel} 기준값이 0 — 증가율 정의 불가` };
  }
  const turnedPositive = previous.normalized < 0 && current.normalized >= 0;
  const turnedNegative = previous.normalized >= 0 && current.normalized < 0;
  if (turnedPositive || turnedNegative) {
    return {
      ...base,
      normalized: null,
      displayState: "NA_NEGATIVE_BASE",
      derivation: `${periodLabel} ${formatAmount(previous.normalized)} → ${formatAmount(current.normalized)} — ${turnedPositive ? "흑자전환" : "적자전환"}(증가율 무의미)`,
    };
  }
  const value = ((current.normalized - previous.normalized) / Math.abs(previous.normalized)) * 100;
  return {
    ...base,
    normalized: value,
    displayState: "OK",
    derivation: `${periodLabel} = (${formatAmount(current.normalized)} − ${formatAmount(previous.normalized)}) ÷ |${formatAmount(previous.normalized)}| × 100`,
  };
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
