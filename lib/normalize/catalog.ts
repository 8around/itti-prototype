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

/**
 * 7셋 확장 — 재무상태(유동·비유동)·안정성(순차입금·이자보상배율) 원재료.
 * 기존 ACNT_ALL_CANDIDATES는 손대지 않고 별도 배열로 append한다(엔진이 두 배열을 이어 붙여 순회).
 */
export const ACNT_ALL_7SETS_CANDIDATES: MetricCandidate[] = [
  { key: "current_assets", label: "유동자산", accountIds: ["ifrs-full_CurrentAssets"], sjDivPriority: ["BS"], unit: "KRW", sourceAvailable: true, source: "acntAll" },
  { key: "noncurrent_assets", label: "비유동자산", accountIds: ["ifrs-full_NoncurrentAssets"], sjDivPriority: ["BS"], unit: "KRW", sourceAvailable: true, source: "acntAll" },
  { key: "current_liabilities", label: "유동부채", accountIds: ["ifrs-full_CurrentLiabilities"], sjDivPriority: ["BS"], unit: "KRW", sourceAvailable: true, source: "acntAll" },
  { key: "noncurrent_liabilities", label: "비유동부채", accountIds: ["ifrs-full_NoncurrentLiabilities"], sjDivPriority: ["BS"], unit: "KRW", sourceAvailable: true, source: "acntAll" },
  { key: "cash_and_equivalents", label: "현금및현금성자산", accountIds: ["ifrs-full_CashAndCashEquivalents"], sjDivPriority: ["BS"], unit: "KRW", sourceAvailable: true, source: "acntAll" },
  {
    key: "short_term_investments",
    label: "단기금융상품",
    accountIds: ["ifrs-full_ShorttermDepositsNotClassifiedAsCashEquivalents"],
    sjDivPriority: ["BS"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
  {
    key: "interest_expense",
    label: "이자비용",
    // 삼성전자처럼 순수 이자비용 행 없이 금융비용(ifrs-full_FinanceCosts)만 공시하는 회사가 많다.
    // 폴백이 적용되면 이자보상배율의 분모가 "이자비용"이 아니라 "금융비용"이 되므로,
    // 화면에서 derivation 문구로 어느 계정을 썼는지 반드시 드러내야 한다.
    accountIds: ["ifrs-full_InterestExpense", "ifrs-full_FinanceCosts"],
    sjDivPriority: ["IS", "CIS"],
    unit: "KRW",
    sourceAvailable: true,
    source: "acntAll",
  },
];

/**
 * 순차입금 = 총차입금 − 현금성자산. **총차입금은 단일 계정이 아니라 여러 계정의 합**이라
 * 폴백 체인(첫 HIT 하나만 채택)으로는 표현할 수 없다 — deriveNetDebt가 아래 두 목록을
 * 전부 훑어 존재하는 것만 합산한다.
 *
 * 20종목 실측 기준 account_id 편차가 가장 심한 영역이다(`ShorttermBorrowings` /
 * `CurrentBorrowingsAndCurrentPortionOfNoncurrentBorrowings` / `Borrowings` /
 * `LoansReceived` … 회사마다 다름). 이 목록에 없는 계정을 쓰는 회사는 총차입금이
 * 과소 집계되므로, 화면에는 **합산에 실제로 잡힌 계정명을 전부 노출**한다.
 */
export const BORROWING_ACCOUNT_IDS = [
  // 유동
  "ifrs-full_ShorttermBorrowings",
  "ifrs-full_CurrentBorrowingsAndCurrentPortionOfNoncurrentBorrowings",
  "ifrs-full_CurrentPortionOfLongtermBorrowings",
  "ifrs-full_CurrentBondsIssuedAndCurrentPortionOfNoncurrentBondsIssued",
  "dart_CurrentPortionOfConvertibleBonds",
  // 비유동
  "ifrs-full_LongtermBorrowings",
  "ifrs-full_NoncurrentPortionOfNoncurrentLoansReceived",
  "ifrs-full_NoncurrentPortionOfNoncurrentBondsIssued",
  "ifrs-full_NoncurrentPortionOfOtherNoncurrentBorrowings",
  "ifrs-full_BondsIssued",
  "dart_ConvertibleBonds",
  "dart_LongTermBorrowingsGross",
  // 유동/비유동 구분 없이 한 행으로 공시하는 회사
  "ifrs-full_Borrowings",
  "ifrs-full_OtherBorrowings",
  "ifrs-full_LoansReceived",
] as const;

/** 순차입금 계산에서 총차입금에서 차감하는 현금성 자산 키(위 ACNT_ALL_7SETS_CANDIDATES의 key). */
export const CASH_LIKE_KEYS = ["cash_and_equivalents", "short_term_investments"] as const;

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

/**
 * 7셋 확장 — `fnlttSinglIndx`가 이미 산출해 주는 비율·성장률. 우리가 나눗셈을 하는 대신
 * DART 산출값을 1순위로 쓰고(권위 있는 값), 결측(`undefined`/`#########`)일 때만 자체 계산으로
 * 폴백한다(derive.ts). 두 경로 중 어느 쪽이 쓰였는지는 Resolution.derivation에 남는다.
 *
 * idxClCode는 카테고리이며 콤마 다중지정이 불가해 카테고리마다 개별 호출이 필요하다(#42) —
 * 이미 4카테고리 전부 수집돼 있어 추가 호출 없이 파싱만 늘리면 된다.
 */
export const SINGL_INDX_7SETS_CANDIDATES: MetricCandidate[] = [
  // M210000 수익성
  { key: "net_margin_indx", label: "순이익률(DART 산출)", accountIds: ["M211200"], sjDivPriority: [], unit: "PCT", sourceAvailable: true, source: "singlIndx", idxClCode: "M210000" },
  { key: "gross_margin_indx", label: "매출총이익률(DART 산출)", accountIds: ["M211300"], sjDivPriority: [], unit: "PCT", sourceAvailable: true, source: "singlIndx", idxClCode: "M210000" },
  // M220000 안정성
  { key: "equity_ratio", label: "자기자본비율", accountIds: ["M221000"], sjDivPriority: [], unit: "PCT", sourceAvailable: true, source: "singlIndx", idxClCode: "M220000" },
  { key: "current_ratio", label: "유동비율", accountIds: ["M221200"], sjDivPriority: [], unit: "PCT", sourceAvailable: true, source: "singlIndx", idxClCode: "M220000" },
  {
    key: "interest_coverage_indx",
    label: "이자보상배율(DART 산출)",
    // 실측상 20종목 대부분 결측이다 — 자체 계산(deriveInterestCoverage)이 사실상 주력이 된다.
    accountIds: ["M221600"],
    sjDivPriority: [],
    unit: "X",
    sourceAvailable: true,
    source: "singlIndx",
    idxClCode: "M220000",
  },
  // M230000 성장성 (전부 YoY)
  { key: "revenue_growth_yoy_indx", label: "매출액증가율(YoY, DART 산출)", accountIds: ["M231000"], sjDivPriority: [], unit: "PCT", sourceAvailable: true, source: "singlIndx", idxClCode: "M230000" },
  { key: "gross_profit_growth_yoy_indx", label: "매출총이익증가율(YoY, DART 산출)", accountIds: ["M231200"], sjDivPriority: [], unit: "PCT", sourceAvailable: true, source: "singlIndx", idxClCode: "M230000" },
  { key: "operating_income_growth_yoy_indx", label: "영업이익증가율(YoY, DART 산출)", accountIds: ["M231400"], sjDivPriority: [], unit: "PCT", sourceAvailable: true, source: "singlIndx", idxClCode: "M230000" },
  { key: "net_income_growth_yoy_indx", label: "순이익증가율(YoY, DART 산출)", accountIds: ["M231800"], sjDivPriority: [], unit: "PCT", sourceAvailable: true, source: "singlIndx", idxClCode: "M230000" },
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
