/**
 * v3 V5 — 지표 카탈로그의 "설명" 축. 지표 하나가 **어떻게 나온 값인지**(formula)와 **무엇을
 * 뜻하는지**(description)를 담는다.
 *
 * 지금까지 이 정보는 필요한 곳에만 라벨 문자열로 끼워 넣혀 있었다 — `app/stock/[code]/page.tsx`의
 * `"ROA(총자산이익률(총액 기준), 계산: 당기순이익(총액)÷자산총계)"` 한 곳뿐이었고 나머지 지표는
 * 아예 설명이 없어 일관성이 없었다(브리프 §V5(c)). 그 계산식을 라벨에서 빼내 여기로 이관한다.
 *
 * **`derivationDetail`(엔진 산출)과 역할이 다르다**: 저쪽은 "이 종목 이 기간의 이 값이 실제로
 * 어떤 숫자에서 나왔는가"(인스턴스), 이쪽은 "이 지표는 원래 어떻게 정의되는가"(카탈로그)다.
 * 직독 지표(ROE·DPS 등)는 파생 계산이 없어 `derivationDetail`이 아예 없지만 설명은 필요하다 —
 * 그 빈칸을 메우는 게 이 파일이다.
 *
 * 프로필마다 정의가 갈리는 지표(같은 key가 다른 계정을 가리키는 경우)는 여기가 아니라
 * `PROFILE_CATALOG`(lib/profiles.ts)의 항목별 `formula`/`description`이 우선한다 —
 * `metricDoc()`이 그 우선순위를 구현한다.
 */

export type MetricDoc = {
  /** 계산식. 우리가 직접 계산하는 파생 지표에만 있다 — 직독 지표에는 없다(있으면 거짓말이 된다). */
  formula?: string;
  /** 이 값이 무엇인지·어디서 왔는지·어떤 함정이 있는지. */
  description?: string;
};

/** DART API가 제공하지 않아 원문 보고서를 봐야 하는 건전성 지표들의 공통 안내. */
const SOURCE_NOT_AVAILABLE_DESC = "DART API 미제공 — 사업보고서 원문 '5. 재무건전성 등 기타참고사항'에 있다. 이 프로토타입은 원문 파싱을 하지 않아 정직하게 미확보로 표기한다.";

export const METRIC_DOCS: Record<string, MetricDoc> = {
  /* 손익 — 직독 */
  revenue: { description: "손익계산서 매출액(ifrs-full_Revenue) 직독. 금융업은 이 계정 자체가 없어 '해당 없음'으로 표기한다." },
  gross_profit: { description: "DART가 계산해 공시한 매출총이익 직독 — 우리가 매출액에서 매출원가를 빼지 않는다." },
  operating_income: { description: "영업이익 직독. 금융업은 dart_OperatingIncomeLoss 행이 없어 ifrs-full_ProfitLossFromOperatingActivities로 폴백한다." },
  net_income: { description: "지배주주+비지배주주 총액(ifrs-full_ProfitLoss). 지배주주 귀속분과 부호까지 갈릴 수 있다(LG화학 2024: 총액 흑자, 지배주주 적자)." },
  net_income_attributable_to_owners: { description: "연결 자회사의 소액주주 몫을 뺀 지배주주 귀속 순이익(ifrs-full_ProfitLossAttributableToOwnersOfParent). 주주 관점의 주 지표다." },
  operating_margin: { formula: "영업이익 ÷ 매출액 × 100", description: "매출액이 없는 금융 프로필에서는 계산 자체가 성립하지 않는다." },

  /* 재무상태 — 직독(시점 데이터라 분기 차분·역산 금지) */
  total_assets: { description: "재무상태표 자산총계 직독. 시점 데이터라 분기 값도 각 분기말을 그대로 읽는다." },
  total_liabilities: { description: "재무상태표 부채총계 직독." },
  total_equity: { description: "재무상태표 자본총계 직독(지배주주+비지배주주)." },
  equity_attributable_to_owners: { description: "자본총계 중 지배주주 귀속분." },

  /* 현금흐름 */
  operating_cf: { description: "영업활동현금흐름. 현금흐름표는 누적으로만 신고돼 분기 값은 인접 분기 차분으로 만든다(잠정치)." },
  investing_cf: { description: "투자활동현금흐름. 분기 값은 인접 분기 차분(잠정치)." },
  financing_cf: { description: "재무활동현금흐름. 분기 값은 인접 분기 차분(잠정치)." },
  capex: { description: "유형자산 취득액만 포함하고 무형자산 취득은 제외한다(KRX 관행). 원문 부호를 정규화하지 않아 음수로 신고한 종목이 있다." },
  fcf: {
    formula: "영업활동현금흐름 − 설비투자(CAPEX, 유형자산 취득)",
    description: "CAPEX 원문 부호를 정규화하지 않아, 음수로 신고한 종목(LG화학 등)에서는 뺄셈이 덧셈이 되어 과대 계산된다 — 알려진 미해결 이월 사항이다.",
  },

  /* 수익성 */
  roe: {
    description:
      "DART가 산출해 공시한 지표(M211550) 직독 — 우리가 계산하지 않는다. 역산하면 '당기순이익(총액) ÷ 평균 자본총계'이며 업종·회사 무관한 고정 산식이다(24종목 재현). 분자에 비지배 몫이 들어가고 분모가 기말이 아닌 평균이라, 요구사항 기준(지배기업 소유주 귀속)과 값이 다르다.",
  },
  roe_owners: {
    formula: "지배기업 소유주 귀속 당기순이익 ÷ 기말 지배기업 소유주 귀속 자본 × 100",
    description:
      "이띠 요구사항 문서가 지정한 정본 기준(목업 v21.5 'ROE (지배주주·기말 기준)', 상세구현명세 V-08 'ROE·EPS 지배주주 기준 우선'). 분자·분모를 모두 지배기업 소유주 귀속분으로 맞춘다. 귀속 계정이 없는 회사(연결 미작성·비지배지분 0)는 총액으로 폴백하며 두 값은 정의상 같다.",
  },
  roe_owners_on_total_equity: {
    formula: "지배기업 소유주 귀속 당기순이익 ÷ 기말 자본총계 × 100",
    description:
      "이띠 연구원 엑셀(금융업 발라내기.xlsx FS-A)이 실제로 쓰는 혼합 기준 — 분자는 지배주주 몫인데 분모는 비지배지분을 포함한 자본총계라 범위가 어긋난다. 명세와 산출물의 불일치를 대면미팅에서 보여주려는 대조용이며, 기준 확정 후 제거 대상이다.",
  },
  roa: {
    formula: "당기순이익(총액) ÷ 자산총계 × 100",
    description: "DART 산출지표 M212000(총자산영업이익률)은 분자가 영업이익이라 ROA가 아니다 — 그래서 직접 계산한다.",
  },

  /* 안정성 */
  debt_ratio: { description: "DART가 산출해 공시한 지표(M221100) 직독." },
  bis_ratio: { description: SOURCE_NOT_AVAILABLE_DESC },
  npl_ratio: { description: SOURCE_NOT_AVAILABLE_DESC },
  ncr: { description: SOURCE_NOT_AVAILABLE_DESC },
  kics: { description: SOURCE_NOT_AVAILABLE_DESC },

  /* 주주환원 */
  eps_basic: { description: "재무제표의 기본주당이익 직독. 분기 Q4는 연간에서 3분기 누적을 뺀 역산이라 가중평균주식수 변동만큼 근사치다." },
  eps_alotmatter: { description: "'배당에 관한 사항' 공시의 주당순이익 — 재무제표 EPS와 원천이 다른 별개 값이라 수치가 갈릴 수 있다." },
  dps_common: { description: "'배당에 관한 사항'의 보통주 주당 현금배당금. 값이 '-'이고 순이익 행은 있으면 무배당(0원)으로 확정한다 — 데이터 없음과 구분된다." },
  dividend_yield_common: { description: "'배당에 관한 사항'의 보통주 현금배당수익률. 무배당이 확인되면 0%로 표기한다." },
  dividend_payout_indx: { description: "DART가 자체 산출한 배당성향 지표(M451000) 직독. 아래 fallback과 분모 기준이 달라 값이 갈릴 수 있다." },
  dividend_payout_fallback: {
    formula: "현금배당금총액 ÷ 당기순이익(배당공시 기준) × 100",
    description: "'배당에 관한 사항' 두 행을 우리가 직접 나눈 값이다. 두 피연산자 모두 원본이 백만원 단위다.",
  },
  shares_outstanding: { description: "'주식의 총수 현황'의 발행주식총수(합계 행) 직독." },
  treasury_shares: { description: "'주식의 총수 현황'의 자기주식수(합계 행) 직독." },

  /* 금융 프로필 확장 손익 — 프로필별로 정의가 갈리는 것은 PROFILE_CATALOG 쪽 override가 이긴다. */
  net_interest_income: { description: "이자수익에서 이자비용을 뺀 순액. 원본이 순액으로 공시된 계정을 직독하며, 순액 계정이 없는 회사(신영증권 등)는 데이터 없음이 된다." },
  net_fee_income: { description: "수수료수익에서 수수료비용을 뺀 순액. 순액 계정이 없는 회사는 데이터 없음이 된다." },
  credit_loss_allowance: { description: "순영업수익에서 차감되는 비용성 항목이라 100% 스택 세그먼트에 넣지 않는다 — 넣으면 '수익 원천의 일부'처럼 오독된다." },
  interest_revenue: { description: "이자비용을 빼기 전 이자수익 총액." },
  insurance_revenue: { description: "보험서비스비용을 빼기 전 보험수익 총액." },
  other_operating_result: { description: "이자·수수료 외 영업손익 순액." },
  fee_income_gross: { description: "수수료비용을 빼기 전 수수료수익 총액." },
  insurance_revenue_gross: { description: "보험서비스수익 총액." },
  insurance_expense_gross: { description: "보험서비스비용 총액." },
  investment_income_gross: { description: "투자서비스수익 총액." },
  investment_result: { description: "투자수익에서 투자비용을 뺀 순액." },
};

/** 분기 파생 키(`qoq_*`/`yoy_*`/`q4_*`)는 기저 지표의 설명을 그대로 쓴다. */
const DERIVED_KEY_PREFIXES = ["qoq_", "yoy_", "q4_"];

function baseKeyOf(metricKey: string): string {
  const prefix = DERIVED_KEY_PREFIXES.find((p) => metricKey.startsWith(p));
  return prefix ? metricKey.slice(prefix.length) : metricKey;
}

/**
 * 지표 하나의 설명을 찾는다 — 프로필 카탈로그의 항목별 override가 있으면 그것이 이기고,
 * 없으면 전역 `METRIC_DOCS`로 떨어진다.
 *
 * `override`는 호출부가 이미 손에 쥔 `ProfileMetric`을 그대로 넘기면 된다(순환 import 방지 —
 * lib/profiles.ts가 이 파일을 import하지, 그 반대가 아니다).
 */
export function metricDoc(metricKey: string, override?: MetricDoc): MetricDoc | undefined {
  const base = METRIC_DOCS[metricKey] ?? METRIC_DOCS[baseKeyOf(metricKey)];
  if (!override?.formula && !override?.description) return base;
  return { formula: override.formula ?? base?.formula, description: override.description ?? base?.description };
}
