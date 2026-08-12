/**
 * FIN_INSURANCE 전용 손익 후보 카탈로그 (T10 — T7 이월 보강).
 *
 * 2개 보험사(삼성생명 032830·DB손해보험 005830) 2024 스냅샷에서 `account_detail === "-"`
 * 최상위 계정을 실측해 채웠다 — fin-securities-catalog.ts와 동일 근거·동일 패턴
 * (catalog.ts 불변, derived.json 미기록, resolveFinExtras.ts가 요청 시점에 해석).
 *
 * account_id 실측 근거(2024, CIS, account_detail === "-") — 생보/손보 2사 전부 HIT:
 *   보험손익(ifrs-full_InsuranceServiceResult)         삼성생명 536,631,000,000 · DB손해보험 1,719,189,378,646
 *     — FIN_HOLDING의 "보험서비스결과"(dart_InsuranceRevenueExpense, KB금융)와는 계정 ID 자체가
 *     다르다. 은행지주 자회사 편입분과 보험 전업사 원표가 서로 다른 표준계정을 쓴다는 실측
 *     증거(플랜 §3 "생보 vs 손보 차이" 주석의 실제 사례) — 두 프로필이 같은 개념에 다른
 *     account_id를 쓰는 첫 실증.
 *   투자손익(dart_InvestmentIncomeExpenses)            삼성생명 1,963,120,000,000 · DB손해보험 705,736,225,311
 *   보험서비스수익(총)(dart_OperatingIncomeInsurance)    삼성생명 9,190,107,000,000 · DB손해보험 16,078,175,837,587
 *   보험서비스비용(총)(dart_OperatingExpenseInsurance)   삼성생명 8,653,476,000,000 · DB손해보험 14,358,986,458,941
 *   투자서비스수익(총)(ifrs-full_InvestmentIncome)       삼성생명 24,595,922,000,000 · DB손해보험 5,756,815,463,478
 * 상세: task-T10-report.md 카탈로그 보강 실측표.
 */
import type { MetricCandidate } from "./types";

export const FIN_INSURANCE_EXTRA_CANDIDATES: MetricCandidate[] = [
  {
    key: "insurance_result",
    label: "보험손익",
    accountIds: ["ifrs-full_InsuranceServiceResult"],
    sjDivPriority: ["IS", "CIS"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
  {
    key: "investment_result",
    label: "투자손익",
    accountIds: ["dart_InvestmentIncomeExpenses"],
    sjDivPriority: ["IS", "CIS"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
  {
    key: "insurance_revenue_gross",
    label: "보험서비스수익(총)",
    accountIds: ["dart_OperatingIncomeInsurance"],
    sjDivPriority: ["IS", "CIS"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
  {
    key: "insurance_expense_gross",
    label: "보험서비스비용(총)",
    accountIds: ["dart_OperatingExpenseInsurance"],
    sjDivPriority: ["IS", "CIS"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
  {
    key: "investment_income_gross",
    label: "투자서비스수익(총)",
    accountIds: ["ifrs-full_InvestmentIncome"],
    sjDivPriority: ["IS", "CIS"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
];
