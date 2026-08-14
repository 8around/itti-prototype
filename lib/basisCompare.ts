/**
 * 관점이 갈리는 지표를 **이 종목의 실제 숫자로** 대조한다 — `?view=basis` 탭의 라이브 비교표.
 *
 * `lib/metricBasis.ts`가 "어떤 관점들이 있는가"를 글로 설명한다면, 여기는 **그 관점을 실제
 * 데이터에 적용하면 이 종목이 얼마가 되는가**를 계산한다. ROE 클레임 때 확인된 것처럼,
 * "LG화학은 부호가 뒤집힙니다"라는 문장 하나보다 그 종목 화면에서 +1.16% / −2.11%를 나란히
 * 보여주는 쪽이 훨씬 빠르게 납득된다.
 *
 * 여기서 계산하는 대안값은 **화면의 채택값을 바꾸지 않는다.** 어디까지나 "다른 기준으로 보면
 * 이렇다"는 참고 수치이며, 채택값은 lib/normalize가 만든 Resolution 그대로다.
 */

import type { StockYearView } from "./stockView";

export type BasisComparison = {
  metric: string;
  /** 화면이 실제로 쓰는 값. */
  adopted: { label: string; value: number | null };
  /** 다른 관점으로 계산한 값들. */
  alternatives: { label: string; value: number | null; note?: string }[];
  unit: "%" | "배" | "원";
  /** 채택값과 대안 사이에 부호가 갈리면 true — 화면에서 강조한다. */
  signFlips: boolean;
  /** 채택값과 대안의 최대 격차(절대값). 정렬·강조에 쓴다. */
  maxGap: number | null;
};

function val(view: StockYearView | undefined, key: string): number | null {
  const r = view?.resolutions[key];
  return r && r.displayState === "OK" ? r.normalized : null;
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

function mean(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : (a + b) / 2;
}

function summarize(adopted: number | null, alts: (number | null)[]): { signFlips: boolean; maxGap: number | null } {
  const defined = alts.filter((v): v is number => v !== null);
  if (adopted === null || defined.length === 0) return { signFlips: false, maxGap: null };
  const signFlips = defined.some((v) => v < 0 !== adopted < 0);
  const maxGap = Math.max(...defined.map((v) => Math.abs(v - adopted)));
  return { signFlips, maxGap };
}

/**
 * ROE — 관점 차이가 가장 크게 드러나는 지표.
 *
 * 채택: DART 산출 `M211550` = 당기순이익(총액) ÷ 평균 자본총계.
 * 대안 ①: 지배주주 귀속 순이익 ÷ 평균 지배주주지분 (FnGuide 등 데이터벤더·증권사 리서치 표준)
 * 대안 ②: 분모를 평균이 아닌 기말 자본총계로 (간이 계산)
 *
 * 전기(prev)가 없으면 평균을 만들 수 없어 평균 기반 대안은 null이 된다.
 */
function compareRoe(current: StockYearView, prev: StockYearView | undefined): BasisComparison {
  const adopted = val(current, "roe");

  const ownerNi = val(current, "net_income_attributable_to_owners");
  const ownerEqNow = val(current, "equity_attributable_to_owners");
  const ownerEqPrev = val(prev, "equity_attributable_to_owners");
  const byOwner = ratio(ownerNi, mean(ownerEqNow, ownerEqPrev));

  const totalNi = val(current, "net_income");
  const byPeriodEnd = ratio(totalNi, val(current, "total_equity"));

  const alternatives = [
    { label: "지배주주 순이익 ÷ 평균 지배주주지분", value: byOwner, note: "FnGuide 등 데이터벤더 · 증권사 리서치 표준" },
    { label: "당기순이익(총액) ÷ 기말 자본총계", value: byPeriodEnd, note: "평균 대신 기말 잔액을 쓰는 간이 계산" },
  ];
  return { metric: "ROE", adopted: { label: "DART 산출 — 총액 ÷ 평균 자본총계", value: adopted }, alternatives, unit: "%", ...summarize(adopted, alternatives.map((a) => a.value)) };
}

/**
 * ROA — 채택안이 기말 자산 기준이라, 평균 자산 기준(ROE와 짝이 맞는 쪽)과 비교해 둔다.
 */
function compareRoa(current: StockYearView, prev: StockYearView | undefined): BasisComparison {
  const adopted = val(current, "roa");

  const totalNi = val(current, "net_income");
  const byAvgAssets = ratio(totalNi, mean(val(current, "total_assets"), val(prev, "total_assets")));
  const byOwnerNi = ratio(val(current, "net_income_attributable_to_owners"), val(current, "total_assets"));

  const alternatives = [
    { label: "당기순이익(총액) ÷ 평균 자산총계", value: byAvgAssets, note: "ROE(평균 기준)와 기준을 맞추는 실무" },
    { label: "지배주주 순이익 ÷ 기말 자산총계", value: byOwnerNi, note: "분자를 지배주주 기준으로 볼 때" },
  ];
  return { metric: "ROA", adopted: { label: "자체 계산 — 총액 ÷ 기말 자산총계", value: adopted }, alternatives, unit: "%", ...summarize(adopted, alternatives.map((a) => a.value)) };
}

/**
 * BPS — 분모를 유통주식수로 바꾸면 자기주식 비중만큼 값이 올라간다.
 */
function compareBps(current: StockYearView): BasisComparison {
  const adopted = val(current, "bps");

  const ownerEq = val(current, "equity_attributable_to_owners");
  const shares = val(current, "shares_outstanding");
  const treasury = val(current, "treasury_shares");
  const floating = shares !== null && treasury !== null ? shares - treasury : null;

  const byFloating = ownerEq !== null && floating !== null && floating > 0 ? ownerEq / floating : null;
  const byTotalEq = ownerEq !== null && shares !== null && shares > 0 ? (val(current, "total_equity") ?? 0) / shares : null;

  const alternatives = [
    { label: "지배주주지분 ÷ 유통주식수(발행 − 자기주식)", value: byFloating, note: "자기주식 소각을 전제한 청산가치" },
    { label: "자본총계(비지배 포함) ÷ 발행주식총수", value: byTotalEq, note: "비지배지분까지 포함한 단순 계산" },
  ];
  return { metric: "BPS", adopted: { label: "자체 계산 — 지배주주지분 ÷ 발행주식총수", value: adopted }, alternatives, unit: "원", ...summarize(adopted, alternatives.map((a) => a.value)) };
}

/**
 * FCF — CAPEX 범위를 넓히거나 투자CF 전체를 빼면 값이 크게 달라진다.
 * 억원 단위가 아니라 원 단위 그대로 두고, 표시 단계에서 변환한다.
 */
function compareFcf(current: StockYearView): BasisComparison {
  const adopted = val(current, "fcf");
  const opCf = val(current, "operating_cf");
  const capex = val(current, "capex");
  const investCf = val(current, "investing_cf");

  // 무형자산 취득은 별도 후보로 수집하고 있지 않아, 여기서는 투자CF 전체 케이스만 대조한다.
  const byInvestingAll = opCf !== null && investCf !== null ? opCf + investCf : null; // 투자CF는 유출이 음수로 온다
  const alternatives = [{ label: "영업CF + 투자활동현금흐름 전체", value: byInvestingAll, note: "금융상품 운용까지 차감돼 실제보다 나쁘게 보인다" }];

  return {
    metric: "FCF",
    adopted: { label: `자체 계산 — 영업CF − 유형자산 취득${capex === null ? " (CAPEX 결측)" : ""}`, value: adopted },
    alternatives,
    unit: "원",
    ...summarize(adopted, alternatives.map((a) => a.value)),
  };
}

/** 이 종목·이 연도에서 관점이 갈리는 지표들의 실측 대조표. */
export function buildBasisComparisons(current: StockYearView, prev: StockYearView | undefined): BasisComparison[] {
  return [compareRoe(current, prev), compareRoa(current, prev), compareBps(current), compareFcf(current)];
}
