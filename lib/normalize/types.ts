/**
 * 정규화 엔진 핵심 자료구조.
 *
 * `ProfileId` / `MetricCandidate` / `Resolution`은 플랜 §7 "핵심 자료구조"(타입 정의 정본)를
 * 그대로 구현한다. `MetricCandidate`는 4개 원천(AcntAll·SinglIndx·alotMatter·stockTotqySttus)을
 * 하나의 타입으로 표현하기 위해 원본 필드는 그대로 두고 소스별 라우팅 메타데이터를 옵셔널로
 * 확장했다 — §7 필드 제거·변경 없음.
 */

export type ProfileId = "STANDARD" | "FIN_BANK" | "FIN_SECURITIES" | "FIN_INSURANCE" | "FIN_HOLDING";

export type MetricSource = "acntAll" | "singlIndx" | "alotMatter" | "stockTotqy" | "derived";

export type MetricCandidate = {
  key: string; // "net_interest_income"
  label: string; // "순이자손익"
  accountIds: string[]; // 폴백 체인 (원천에 따라 account_id / idx_code / alotMatter row key / stockTotqySttus 필드명)
  sjDivPriority: string[]; // ["IS","CIS"] — singlIndx/alotMatter/stockTotqy는 통계상 미사용(빈 배열) 또는 다른 용도로 재해석
  unit: "KRW" | "PCT" | "X";
  sourceAvailable: boolean; // false = DART에 원천 없음 (BIS비율 등)
  /** §7에는 없는 확장 필드 — 소스 라우팅용. */
  source: MetricSource;
  /** singlIndx 전용: idx_cl_code (M210000/M220000/M230000/M240000). */
  idxClCode?: string;
  /** stockTotqySttus 전용: 읽을 필드명. */
  stockTotqyField?: "istc_totqy" | "tesstk_co";
};

export type AttemptResult = "HIT" | "NO_ROW" | "EMPTY_VALUE";

export type DisplayState =
  | "OK" // 정상
  | "ZERO_BY_FACT" // 무배당 확인 → 0원
  | "MISSING" // 우리가 못 읽음 → 데이터 없음
  | "NA_NEGATIVE_BASE" // 분모 음수 → N/A
  | "NOT_IN_PROFILE" // 이 프로필에 해당 없음 (T4에서는 판정하지 않음 — T7 소관)
  | "SOURCE_NOT_AVAILABLE" // DART 미제공
  | "TURN_TO_PROFIT" // 흑자전환 (직전 ≤0, 당기 >0)
  | "TURN_TO_LOSS" // 적자전환 (직전 >0, 당기 ≤0)
  | "LOSS_CONTINUED"; // 적자지속 (직전 ≤0, 당기 ≤0)

export type Resolution = {
  metricKey: string;
  attempts: {
    accountId: string;
    sjDiv?: string;
    result: AttemptResult;
  }[];
  hit?: { accountId: string; accountNm: string; sjDiv: string; rawValue: string; ord: number };
  fsDiv: "CFS" | "OFS";
  fsDivFallbackApplied: boolean;
  normalized: number | null;
  displayState: DisplayState;
  derivation?: string; // "Q4 = 300,870,903,000,000 − 225,082,634,000,000"
  parserVersion: string;
  /**
   * v2 T2 — 클라이언트 승인 규칙 3 "잠정치는 점선" 대상 신호. 직독이 아니라 인접 보고서 차분으로
   * 만든 값(IS/CIS Q4 역산, CF Q2~Q4 단일화)에만 true — 직독값(Q1~Q3 IS/CIS, 전 분기 BS, Q1 CF)
   * 에는 아예 세팅하지 않는다(undefined). EPS Q4는 여기에 더해 가중평균주식수 변동으로 근사치라는
   * 주의 문구를 derivation에 추가로 남긴다.
   */
  provisional?: boolean;
};

/** T4에서는 OK/MISSING/ZERO_BY_FACT/NA_NEGATIVE_BASE 4종만 실제로 배정한다 (NOT_IN_PROFILE·SOURCE_NOT_AVAILABLE은 T7 소관).
 *  v2 T2 — 분기 축 + QoQ/YoY(TURN_TO_PROFIT/TURN_TO_LOSS/LOSS_CONTINUED) + provisional 필드 추가로 범프. */
export const PARSER_VERSION = "v2t2.1";
