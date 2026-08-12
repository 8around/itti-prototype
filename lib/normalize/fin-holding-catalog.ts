/**
 * FIN_HOLDING/FIN_BANK 전용 손익 후보 카탈로그 (T7).
 *
 * T4의 `catalog.ts`(ACNT_ALL_CANDIDATES)는 `data/derived.json`(불변 산출물)의 기반이라 손대지
 * 않는다 — 이 6개 후보는 여기 별도로 선언하고 `resolveFinHoldingExtras.ts`가 요청 시점에
 * 스냅샷에서 직접 해석한다(derived.json에는 절대 기록하지 않는다).
 *
 * account_id 실측 근거: public/snapshots/fnlttSinglAcntAll__00688996__2024__11011__CFS.json
 * (KB금융 2024, CIS, account_detail === "-"):
 *   순이자손익(ifrs-full_InterestRevenueExpense)              12,826,714,000,000
 *   이자수익(ifrs-full_RevenueFromInterest)                   30,491,385,000,000
 *   순수수료손익(ifrs-full_FeeAndCommissionIncomeExpense)      3,849,627,000,000
 *   보험서비스결과(dart_InsuranceRevenueExpense)                1,649,761,000,000
 *   보험수익(ifrs-full_InsuranceRevenue)                      11,017,155,000,000
 *   신용손실충당금 전입액(dart_AdditionReversalOfCreditLossFinancialAssets) 2,044,286,000,000
 * 순이자손익·순수수료손익 값이 브리프 완료판정(12.83조/3.85조)과 일치 확인됨 —
 * lib/normalize/resolveFinHoldingExtras.test.ts 참조.
 */
import type { MetricCandidate } from "./types";

export const FIN_HOLDING_EXTRA_CANDIDATES: MetricCandidate[] = [
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
    key: "interest_revenue",
    label: "이자수익(총)",
    accountIds: ["ifrs-full_RevenueFromInterest"],
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
    key: "insurance_result",
    label: "보험서비스결과",
    accountIds: ["dart_InsuranceRevenueExpense"],
    sjDivPriority: ["IS", "CIS"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
  {
    key: "insurance_revenue",
    label: "보험수익(총)",
    accountIds: ["ifrs-full_InsuranceRevenue"],
    sjDivPriority: ["IS", "CIS"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
  {
    key: "credit_loss_allowance",
    label: "신용손실충당금 전입액",
    accountIds: ["dart_AdditionReversalOfCreditLossFinancialAssets"],
    sjDivPriority: ["IS", "CIS"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
];
