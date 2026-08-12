/**
 * T7 프로필 엔진 — 프로필별 손익/안정성 "후보 지표" 카탈로그 + 존재 여부 판정.
 *
 * 김예지 지적("비금융 공통 ≠ 모든 종목 공통")을 데이터 레벨에서 그대로 구현한다. **이 파일
 * 하나만 고치면**(항목 추가·삭제·주석 처리) `/compare/pnl` 화면에 표시되는 지표가 바뀐다 —
 * 화면 컴포넌트(app/compare/pnl/page.tsx)는 이 카탈로그를 순회할 뿐 지표 키를 하드코딩하지
 * 않는다.
 *
 * `NOT_IN_PROFILE`/`SOURCE_NOT_AVAILABLE` 판정은 T4가 아니라 여기서만 내려진다 — T4는
 * OK/MISSING/ZERO_BY_FACT/NA_NEGATIVE_BASE 4종만 배정한다(lib/normalize/types.ts 주석 참조).
 */
import type { DisplayState, ProfileId, Resolution } from "./normalize/types";

export type ProfileMetric = {
  key: string;
  label: string;
  /** false = DART에 원천 자체가 없음 (BIS비율 등) — Resolution을 시도조차 하지 않는다. */
  sourceAvailable: boolean;
  /**
   * "stacked" = StackedBar100 세그먼트(서로 겹치지 않는 순액·부호 무관하게 합이 전체를 이룸).
   * "deduction" = 위 stacked 합계에서 차감되는 비용성 항목 — 100% 스택에 넣으면 "수익 원천"처럼
   * 오독되므로 별도 구획에 표기한다(리뷰 픽스 1 — credit_loss_allowance).
   */
  chart?: "waterfall" | "stacked" | "deduction" | "none";
  /**
   * MetricValue/SourcePanel 렌더링에 필요한 표시 단위. 브리프의 타입 스니펫(§7)엔 없으나
   * 화면이 이 값 없이는 KRW/PCT 포맷을 구분할 수 없어 컨트롤러 결정으로 추가했다 — T4의
   * MetricCandidate.unit과 동일 도메인.
   */
  unit: "KRW" | "PCT" | "X";
};

export type ProfileCatalog = Record<ProfileId, { pnl: ProfileMetric[]; stability: ProfileMetric[] }>;

/**
 * derive.ts가 다른 두 후보(영업이익÷매출액)로 계산하는 비율 지표 — 자체 account_id 폴백체인이
 * 없어 "후보 N개" 커버리지 집계에서는 제외한다. NOT_IN_PROFILE 판정 대상에서는 제외하지
 * 않는다 — 카탈로그에는 그대로 남아 있어야 KB 화면에 "영업이익률 해당 없음"이 뜬다.
 */
const DERIVED_RATIO_KEYS = new Set(["operating_margin"]);

export const PROFILE_CATALOG: ProfileCatalog = {
  STANDARD: {
    pnl: [
      { key: "revenue", label: "매출액", sourceAvailable: true, chart: "waterfall", unit: "KRW" },
      { key: "gross_profit", label: "매출총이익", sourceAvailable: true, chart: "waterfall", unit: "KRW" },
      { key: "operating_income", label: "영업이익", sourceAvailable: true, chart: "waterfall", unit: "KRW" },
      { key: "net_income", label: "당기순이익", sourceAvailable: true, chart: "waterfall", unit: "KRW" },
      { key: "operating_margin", label: "영업이익률", sourceAvailable: true, chart: "none", unit: "PCT" },
    ],
    stability: [{ key: "debt_ratio", label: "부채비율", sourceAvailable: true, chart: "none", unit: "PCT" }],
  },
  FIN_HOLDING: {
    pnl: [
      { key: "net_interest_income", label: "순이자손익", sourceAvailable: true, chart: "stacked", unit: "KRW" },
      { key: "net_fee_income", label: "순수수료손익", sourceAvailable: true, chart: "stacked", unit: "KRW" },
      { key: "insurance_result", label: "보험서비스결과", sourceAvailable: true, chart: "stacked", unit: "KRW" },
      // 리뷰 픽스 1: 이익 기여형 순액 3개(위)와 달리 이 항목은 그 합계를 깎아 먹는 비용성
      // 항목이다 — 실측값이 양수여도 100% 스택에 넣으면 "수익원의 ~10%"처럼 오독된다.
      { key: "credit_loss_allowance", label: "신용손실충당금 전입액", sourceAvailable: true, chart: "deduction", unit: "KRW" },
      { key: "interest_revenue", label: "이자수익(총)", sourceAvailable: true, chart: "none", unit: "KRW" },
      { key: "insurance_revenue", label: "보험수익(총)", sourceAvailable: true, chart: "none", unit: "KRW" },
      { key: "operating_income", label: "영업이익", sourceAvailable: true, chart: "none", unit: "KRW" },
      { key: "net_income", label: "당기순이익", sourceAvailable: true, chart: "none", unit: "KRW" },
    ],
    stability: [
      { key: "bis_ratio", label: "BIS비율", sourceAvailable: false, chart: "none", unit: "PCT" },
      { key: "npl_ratio", label: "고정이하여신비율(NPL)", sourceAvailable: false, chart: "none", unit: "PCT" },
    ],
  },
  // 이번 주 유니버스엔 은행(FIN_BANK) 프로필 종목이 없다(T2 이월 노트) — 지주와 동일한 계정
  // 체계를 재사용해 둔다. 보험 세그먼트(insurance_*)는 순수 은행엔 없어 제외했다.
  FIN_BANK: {
    pnl: [
      { key: "net_interest_income", label: "순이자손익", sourceAvailable: true, chart: "stacked", unit: "KRW" },
      { key: "net_fee_income", label: "순수수료손익", sourceAvailable: true, chart: "stacked", unit: "KRW" },
      { key: "credit_loss_allowance", label: "신용손실충당금 전입액", sourceAvailable: true, chart: "deduction", unit: "KRW" },
      { key: "interest_revenue", label: "이자수익(총)", sourceAvailable: true, chart: "none", unit: "KRW" },
      { key: "operating_income", label: "영업이익", sourceAvailable: true, chart: "none", unit: "KRW" },
      { key: "net_income", label: "당기순이익", sourceAvailable: true, chart: "none", unit: "KRW" },
    ],
    stability: [
      { key: "bis_ratio", label: "BIS비율", sourceAvailable: false, chart: "none", unit: "PCT" },
      { key: "npl_ratio", label: "고정이하여신비율(NPL)", sourceAvailable: false, chart: "none", unit: "PCT" },
    ],
  },
  // FIN_SECURITIES·FIN_INSURANCE 전용 손익 계정은 T7 범위 밖이다 — 플랜 §14 R2("증권·보험
  // 4종은 미검증")대로 계정 실측 없이 후보를 지어내지 않는다. T10이 실측 후 보강할 때까지는
  // 두 프로필 공통으로 이미 검증된 operating_income/net_income만 노출한다.
  FIN_SECURITIES: {
    pnl: [
      { key: "operating_income", label: "영업이익", sourceAvailable: true, chart: "none", unit: "KRW" },
      { key: "net_income", label: "당기순이익", sourceAvailable: true, chart: "none", unit: "KRW" },
    ],
    stability: [{ key: "ncr", label: "순자본비율(NCR)", sourceAvailable: false, chart: "none", unit: "PCT" }],
  },
  FIN_INSURANCE: {
    pnl: [
      { key: "operating_income", label: "영업이익", sourceAvailable: true, chart: "none", unit: "KRW" },
      { key: "net_income", label: "당기순이익", sourceAvailable: true, chart: "none", unit: "KRW" },
    ],
    stability: [{ key: "kics", label: "K-ICS비율", sourceAvailable: false, chart: "none", unit: "PCT" }],
  },
};

/** universe.json의 `profile` 필드("NON_FIN" 등)를 ProfileId로 매핑한다 — 두 어휘가 다르다(T2 이월 노트). */
const UNIVERSE_PROFILE_TO_PROFILE_ID: Record<string, ProfileId> = {
  NON_FIN: "STANDARD",
  FIN_BANK: "FIN_BANK",
  FIN_SECURITIES: "FIN_SECURITIES",
  FIN_INSURANCE: "FIN_INSURANCE",
  FIN_HOLDING: "FIN_HOLDING",
};

export function toProfileId(universeProfile: string): ProfileId {
  const id = UNIVERSE_PROFILE_TO_PROFILE_ID[universeProfile];
  if (!id) throw new Error(`알 수 없는 universe.json profile 값: ${universeProfile}`);
  return id;
}

export function findProfileMetric(profile: ProfileId, metricKey: string): ProfileMetric | undefined {
  const catalog = PROFILE_CATALOG[profile];
  return catalog.pnl.find((m) => m.key === metricKey) ?? catalog.stability.find((m) => m.key === metricKey);
}

/**
 * displayState 부여 규칙(T7 소관 — 플랜 §7 정본의 NOT_IN_PROFILE/SOURCE_NOT_AVAILABLE 주석
 * 그대로):
 * 1) 카탈로그에 없는 지표를 요청 → NOT_IN_PROFILE
 * 2) sourceAvailable:false → SOURCE_NOT_AVAILABLE (Resolution 자체가 없다 — DART에 원천이 없다)
 * 3) 그 외 → T4가 이미 배정한 displayState를 그대로 통과시킨다
 */
export function resolveDisplay(profile: ProfileId, metricKey: string, resolution?: Resolution): DisplayState {
  const metric = findProfileMetric(profile, metricKey);
  if (!metric) return "NOT_IN_PROFILE";
  if (!metric.sourceAvailable) return "SOURCE_NOT_AVAILABLE";
  if (!resolution) return "MISSING";
  return resolution.displayState;
}

/**
 * SourcePanel의 폴백 탭도 위 판정과 일관되게 보이도록 displayState만 덮어쓴다(attempts/hit 등
 * 나머지는 T4 원본 그대로 유지 — "ifrs-full_Revenue @IS → NO_ROW / @CIS → NO_ROW" 같은 실제
 * 시도 이력은 지워지지 않는다).
 */
export function withDisplayState(resolution: Resolution, state: DisplayState): Resolution {
  return { ...resolution, displayState: state };
}

/** 프로필 자기 자신의 pnl 후보 중 "실제 account_id 폴백체인을 가진" 것만 커버리지 집계 대상으로 삼는다. */
function countableKeys(profile: ProfileId): string[] {
  return PROFILE_CATALOG[profile].pnl.map((m) => m.key).filter((k) => !DERIVED_RATIO_KEYS.has(k));
}

export interface CoverageItem {
  key: string;
  label: string;
  state: DisplayState;
}

export interface PnlCoverage {
  total: number;
  hit: number;
  missing: CoverageItem[];
}

/**
 * "후보 N개 중 M개 존재 / (N-M)개 미존재" — N·M을 하드코딩하지 않고 실제 resolutions(derived.json +
 * 요청 시점 추가 해석)로 계산한다.
 */
export function summarizePnlCoverage(profile: ProfileId, resolutions: Record<string, Resolution | undefined>): PnlCoverage {
  const keys = countableKeys(profile);
  const missing: CoverageItem[] = [];
  let hit = 0;
  for (const key of keys) {
    const metric = findProfileMetric(profile, key);
    if (!metric) continue;
    const state = resolveDisplay(profile, key, resolutions[key]);
    if (state === "OK" || state === "ZERO_BY_FACT") hit++;
    else missing.push({ key, label: metric.label, state });
  }
  return { total: keys.length, hit, missing };
}

/**
 * `sourceProfile` 카탈로그에는 있지만 `targetProfile` 카탈로그엔 없는 pnl 키 — "해당 없음" 데모
 * 행에 쓴다. 화면 컴포넌트가 "revenue"/"gross_profit" 같은 지표 키를 직접 하드코딩하지 않도록,
 * 두 카탈로그를 비교해서 목록을 계산해 낸다.
 */
export function pnlKeysOnlyIn(sourceProfile: ProfileId, targetProfile: ProfileId): string[] {
  const targetKeys = new Set(PROFILE_CATALOG[targetProfile].pnl.map((m) => m.key));
  return PROFILE_CATALOG[sourceProfile].pnl.map((m) => m.key).filter((k) => !targetKeys.has(k));
}
