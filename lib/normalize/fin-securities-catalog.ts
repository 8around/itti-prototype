/**
 * FIN_SECURITIES 전용 손익 후보 카탈로그 (T10 — T7 이월 보강).
 *
 * T7은 "증권·보험 4종은 미검증"(플랜 §14 R2)으로 남겨두고 operating_income/net_income만
 * 노출했다(lib/profiles.ts 주석 참조). T10이 3개 증권사(삼성증권 016360·NH투자증권 005940·
 * 신영증권 001720) 2024 스냅샷에서 `account_detail === "-"` 최상위 계정을 실측해 이 카탈로그를
 * 채웠다 — catalog.ts(T4, ACNT_ALL_CANDIDATES)는 이미 "불변 산출물"로 문서화돼 있어 손대지
 * 않고(fin-holding-catalog.ts와 동일 패턴), 여기 별도 선언 후 resolveFinExtras.ts가 요청 시점에
 * 스냅샷에서 직접 해석한다 — derived.json에는 기록되지 않는다.
 *
 * account_id 실측 근거(2024, CIS, account_detail === "-"):
 *   순이자손익(ifrs-full_InterestRevenueExpense)         삼성 668,147,980,003 · NH 801,775,000,000 · 신영 없음(NO_ROW)
 *   순수수료손익(ifrs-full_FeeAndCommissionIncomeExpense)  삼성 948,541,876,681 · NH 954,676,000,000 · 신영 없음(NO_ROW)
 *   기타영업손익(ifrs-full_OtherOperatingIncomeExpense)    삼성 146,712,716,595 · NH 207,577,000,000 · 신영 없음(NO_ROW)
 *   이자수익(총)(ifrs-full_RevenueFromInterest)            삼성 1,691,960,043,439 · NH 1,740,437,000,000 · 신영 321,899,677,873 — 3사 전부 HIT
 *   수수료수익(총)(ifrs-full_FeeAndCommissionIncome)        삼성 1,146,627,595,048 · NH 1,178,025,000,000 · 신영 151,195,054,600 — 3사 전부 HIT
 * 신영증권은 순액(net) 계정을 별도로 작성하지 않고 총액(수수료수익/수수료비용 등)만 공시한다 —
 * 실제 계정명 편차이지 버그가 아니다(MISSING이 정직한 상태). 상세: task-T10-report.md 카탈로그
 * 보강 실측표.
 */
import type { MetricCandidate } from "./types";

export const FIN_SECURITIES_EXTRA_CANDIDATES: MetricCandidate[] = [
  {
    key: "net_interest_income",
    label: "순이자손익",
    accountIds: ["ifrs-full_InterestRevenueExpense"],
    sjDivPriority: ["IS", "CIS"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
  {
    key: "net_fee_income",
    label: "순수수료손익",
    accountIds: ["ifrs-full_FeeAndCommissionIncomeExpense"],
    sjDivPriority: ["IS", "CIS"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
  {
    key: "other_operating_result",
    label: "기타영업손익",
    accountIds: ["ifrs-full_OtherOperatingIncomeExpense"],
    sjDivPriority: ["IS", "CIS"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
  {
    key: "interest_revenue",
    label: "이자수익(총)",
    accountIds: ["ifrs-full_RevenueFromInterest"],
    sjDivPriority: ["IS", "CIS"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
  {
    key: "fee_income_gross",
    label: "수수료수익(총)",
    accountIds: ["ifrs-full_FeeAndCommissionIncome"],
    sjDivPriority: ["IS", "CIS"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
];
