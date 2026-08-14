/**
 * T4 범위의 지표 후보 카탈로그. `account_id` 기준 매핑 + 폴백 배열로 구성하고,
 * `account_nm`은 표시용으로만 쓴다 (§1.5 판정). 정규화 매핑은 이 파일에만 있다 — 프로토타입
 * 규모상 DB+Admin으로 빼지 않고 하드코딩했다(운영 전환 시 이관 대상).
 */

import type { MetricCandidate } from "./types";

export const ACNT_ALL_CANDIDATES: MetricCandidate[] = [
  { key: "revenue", label: "매출액", accountIds: ["ifrs-full_Revenue"], sjDivPriority: ["IS", "CIS"], unit: "KRW", sourceAvailable: true, source: "acntAll" },
  { key: "gross_profit", label: "매출총이익", accountIds: ["ifrs-full_GrossProfit"], sjDivPriority: ["IS", "CIS"], unit: "KRW", sourceAvailable: true, source: "acntAll" },
  {
    key: "operating_income",
    label: "영업이익",
    // 금융업(KB금융 등)은 dart_OperatingIncomeLoss 행이 없고 ifrs-full_ProfitLossFromOperatingActivities만 있다 (#46).
    accountIds: ["dart_OperatingIncomeLoss", "ifrs-full_ProfitLossFromOperatingActivities"],
    sjDivPriority: ["IS", "CIS"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
  {
    key: "net_income",
    label: "당기순이익",
    // IS/CIS/CF 3중복 (#35) — sjDivPriority 순서로 dedupe.
    accountIds: ["ifrs-full_ProfitLoss"],
    sjDivPriority: ["IS", "CIS", "CF"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
  { key: "total_assets", label: "자산총계", accountIds: ["ifrs-full_Assets"], sjDivPriority: ["BS"], unit: "KRW", sourceAvailable: true, source: "acntAll" },
  { key: "total_liabilities", label: "부채총계", accountIds: ["ifrs-full_Liabilities"], sjDivPriority: ["BS"], unit: "KRW", sourceAvailable: true, source: "acntAll" },
  { key: "total_equity", label: "자본총계", accountIds: ["ifrs-full_Equity"], sjDivPriority: ["BS"], unit: "KRW", sourceAvailable: true, source: "acntAll" },
  {
    key: "equity_attributable_to_owners",
    label: "지배주주지분",
    accountIds: ["ifrs-full_EquityAttributableToOwnersOfParent"],
    sjDivPriority: ["BS"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
  { key: "operating_cf", label: "영업활동현금흐름", accountIds: ["ifrs-full_CashFlowsFromUsedInOperatingActivities"], sjDivPriority: ["CF"], unit: "KRW", sourceAvailable: true, source: "acntAll" },
  { key: "investing_cf", label: "투자활동현금흐름", accountIds: ["ifrs-full_CashFlowsFromUsedInInvestingActivities"], sjDivPriority: ["CF"], unit: "KRW", sourceAvailable: true, source: "acntAll" },
  { key: "financing_cf", label: "재무활동현금흐름", accountIds: ["ifrs-full_CashFlowsFromUsedInFinancingActivities"], sjDivPriority: ["CF"], unit: "KRW", sourceAvailable: true, source: "acntAll" },
  {
    key: "capex",
    label: "설비투자(CAPEX)",
    // ★ CAPEX 스파이크 결정 (task-T4-report.md 참조): 유형자산 취득만 포함, 무형자산 취득 제외
    // (KRX 관행). 삼성전자 2024 CFS 실측 account_id: ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities
    // (51,406,355,000,000원). 무형자산 취득 포함 시 대안 ID:
    // ifrs-full_PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities (2,335,284,000,000원) — 클라이언트 확인 필요.
    accountIds: ["ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"],
    sjDivPriority: ["CF"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
  {
    key: "eps_basic",
    label: "기본주당이익",
    // 헬릭스미스는 BasicEarningsLossPerShare 행이 없고 …FromContinuingOperations만 있다 (#34).
    accountIds: ["ifrs-full_BasicEarningsLossPerShare", "ifrs-full_BasicEarningsLossPerShareFromContinuingOperations"],
    sjDivPriority: ["IS", "CIS"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
  // 최종 리뷰 픽스(C1): net_income(ifrs-full_ProfitLoss)은 지배주주+비지배주주 "총액"이라
  // 지주사 순이익(연결 대상 자회사 소액주주 몫 포함)과 혼동되기 쉽다 — 실제로 부호까지 갈릴 수
  // 있다(LG화학 2024: 총액 +5,150.11억 흑자인데 지배주주 귀속분은 −6,908.54억 적자, 카카오
  // 2024: 총액 −1,618.71억 적자인데 지배주주 귀속분은 +552.77억 흑자). 기존 net_income 엔트리는
  // 수정하지 않고 이 후보를 append해 두 값을 병기한다.
  {
    key: "net_income_attributable_to_owners",
    label: "당기순이익(지배주주)",
    accountIds: ["ifrs-full_ProfitLossAttributableToOwnersOfParent"],
    sjDivPriority: ["IS", "CIS"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
];

export const SINGL_INDX_CANDIDATES: MetricCandidate[] = [
  { key: "roe", label: "ROE", accountIds: ["M211550"], sjDivPriority: [], unit: "PCT", sourceAvailable: true, source: "singlIndx", idxClCode: "M210000" },
  { key: "debt_ratio", label: "부채비율", accountIds: ["M221100"], sjDivPriority: [], unit: "PCT", sourceAvailable: true, source: "singlIndx", idxClCode: "M220000" },
  {
    key: "dividend_payout_indx",
    label: "배당성향(%, DART 산출)",
    // 브리프의 T4 지표 목록엔 없으나 완료판정 테스트케이스("카카오 배당성향 -26.858")가 이 값을
    // 요구해 추가했다 — alotMatter 기반 dividend_payout_fallback과는 별개 원천이다.
    accountIds: ["M451000"],
    sjDivPriority: [],
    unit: "PCT",
    sourceAvailable: true,
    source: "singlIndx",
    idxClCode: "M240000",
  },
];

export const ALOT_MATTER_CANDIDATES: MetricCandidate[] = [
  { key: "eps_alotmatter", label: "주당순이익(배당공시 idx3)", accountIds: ["eps"], sjDivPriority: [], unit: "KRW", sourceAvailable: true, source: "alotMatter" },
  { key: "dps_common", label: "주당현금배당금(보통주, idx11)", accountIds: ["dps_common"], sjDivPriority: [], unit: "KRW", sourceAvailable: true, source: "alotMatter" },
  { key: "dividend_yield_common", label: "현금배당수익률(보통주, idx7)", accountIds: ["yield_common"], sjDivPriority: [], unit: "PCT", sourceAvailable: true, source: "alotMatter" },
  { key: "payout", label: "현금배당성향(idx6)", accountIds: ["payout"], sjDivPriority: [], unit: "PCT", sourceAvailable: true, source: "alotMatter" },
];

export const STOCK_TOTQY_CANDIDATES: MetricCandidate[] = [
  { key: "shares_outstanding", label: "발행주식총수", accountIds: ["istc_totqy"], sjDivPriority: ["합계"], unit: "X", sourceAvailable: true, source: "stockTotqy", stockTotqyField: "istc_totqy" },
  { key: "treasury_shares", label: "자기주식수", accountIds: ["tesstk_co"], sjDivPriority: ["합계"], unit: "X", sourceAvailable: true, source: "stockTotqy", stockTotqyField: "tesstk_co" },
];

/** 4Q 역산 대상 — IS/CIS 흐름 계정만(#39). BS 항목(자산총계 등)은 시점 데이터라 제외한다. */
export const Q4_DERIVABLE_KEYS = ["revenue", "operating_income", "net_income"] as const;

/**
 * v2 T2 — 분기 축(quarters[]) 계정 분류. T1V 판정(task-T1-report.md PART B)에서 도출된 규약을
 * 그대로 코드화한다: IS/CIS는 흐름(Q1~Q3 thstrm 직독·Q4=FY.thstrm−Q3.thstrm_add 역산),
 * BS는 시점(매 분기 thstrm 직독, 차분 금지), CF는 누적(Q1=thstrm 직독·Q2~Q4=인접 reprt 차분).
 * ACNT_ALL_CANDIDATES와 동일한 key를 재사용한다 — 별도 카탈로그를 두지 않는다(원장이 하나이므로).
 */
export const QUARTER_FLOW_KEYS = [
  "revenue",
  "gross_profit",
  "operating_income",
  "net_income",
  "net_income_attributable_to_owners",
  "eps_basic",
] as const;

/** BS(시점) — 분기말 스냅샷을 그대로 쓴다. 연간 3개년+최신 분기말 1개 노출은 §3 컨트롤러 확정 사항. */
export const QUARTER_POINT_KEYS = ["total_assets", "total_liabilities", "total_equity", "equity_attributable_to_owners"] as const;

/** CF(누적) — T1V 판정2: thstrm_add_amount 필드가 없어 인접 reprt 차분이 유일한 단일분기화 경로다. */
export const QUARTER_CUMULATIVE_KEYS = ["operating_cf", "investing_cf", "financing_cf", "capex"] as const;

/** Q4 역산이 가중평균주식수 변동으로 부정확한 지표 — QUARTER_FLOW_KEYS의 부분집합, provisional 사유 문구가 추가된다. */
export const QUARTER_EPS_LIKE_KEYS = ["eps_basic"] as const;

/** QoQ/YoY derive 대상 — 브리프 최소 요구 4종(§4). */
export const GROWTH_KEYS = ["revenue", "operating_income", "net_income_attributable_to_owners", "eps_basic"] as const;
