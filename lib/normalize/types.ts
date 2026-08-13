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

/**
 * v3 V5 — 산식 한 줄을 이루는 피연산자 하나.
 *
 * `op`은 "직전까지 접은(fold) 결과에 이 값을 어떻게 결합하는가"다 — 첫 step은 기준값이라 `op`이
 * 없고, 두 번째부터는 항상 왼쪽부터 순서대로 접는다(괄호 없음). 그래서 `steps`를 왼쪽부터 접으면
 * 언제나 `Resolution.normalized`가 나온다(`derivationDetail.test.ts`가 derived.json 전수로 고정).
 * 예외는 `DerivationDetail.transition`(흑자/적자 전환 — 계산이 아니라 상태 비교)뿐이다.
 */
export type DerivationStep = {
  /** 사람이 읽는 피연산자 이름. 어느 보고서에서 온 값인지까지 담는다 — "2024 3분기보고서 누적". */
  label: string;
  value: number;
  op?: "minus" | "div" | "mul";
  /**
   * `value`가 적힌 단위. 생략하면 "KRW"(원 단위 금액)다.
   * - `KRW_MILLION`: alotMatter 원본이 **백만원 단위로 공시**하는 값(현금배당금총액·당기순이익).
   *   원 단위로 오해해 억/조 환산하면 10^6배 어긋난다 — 이 태그가 그걸 막는다.
   * - `SCALAR`: 백분율 환산 상수 100처럼 단위가 없는 배수.
   */
  unit?: "KRW" | "KRW_MILLION" | "SCALAR";
};

/**
 * v3 V5 — `derivation` 문자열의 **구조화 판(additive)**. 기존 문자열은 그대로 두고 나란히 남긴다.
 *
 * 문자열(`Q4 = 300,870,903,000,000 − 225,082,634,000,000`)은 이미 포맷된 원 단위 raw 숫자라
 * 화면에서 억/조로 환산할 수가 없었다 — 문자열을 파싱하지 않고 **생산 시점에 구조를 함께 남기는**
 * 것이 이 타입의 존재 이유다(브리프 §V5(a)).
 *
 * `resultLabel`은 **지표의 한글 이름만** 담는다("영업이익"). 기간 접두("24.4Q")는 붙이지 않는데,
 * 정확한 기간 라벨은 결산월(`accMt`)에 좌우되고(`lib/period.ts` `quarterAxisLabel` — 비12월 결산
 * 종목은 "제71기 4Q"), 엔진은 `accMt`를 모르기 때문이다. 기간은 화면이 붙인다.
 */
export type DerivationDetail = {
  kind: "q4_reverse" | "cf_diff" | "growth" | "ratio" | "fcf" | "dividend_payout_fallback";
  /** 결과 지표의 한글 이름 — "영업이익". 기간 접두는 화면 몫(위 주석). */
  resultLabel: string;
  steps: DerivationStep[];
  /** **결과**의 단위(피연산자 단위가 아니다 — 그건 각 step의 `unit`). 비율 지표는 KRW를 나눠 PCT가 된다. */
  unit: "KRW" | "PCT" | "X";
  /** 이 값을 잠정치로 만드는 사유 — 계정 불일치·가중평균주식수 변동 등. 둘 다면 " · "로 잇는다. */
  caveat?: string;
  /**
   * true면 `steps`는 계산식이 아니라 "직전 → 당기" **상태 비교**다(흑자전환/적자전환/적자지속).
   * 이 경우 `normalized`는 null이고 접기(fold)가 정의되지 않는다 — 증감률 %는 분모가 0 이하라
   * 왜곡되므로 아예 산출하지 않고 상태만 표기한다는 승인 규칙(derive.ts `deriveGrowth`)의 반영이다.
   */
  transition?: boolean;
};

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
  /** v3 V5 — 위 문자열의 구조화 판(additive). `derivation`이 있는 Resolution에는 항상 함께 있다. */
  derivationDetail?: DerivationDetail;
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
 *  v2 T2 — 분기 축 + QoQ/YoY(TURN_TO_PROFIT/TURN_TO_LOSS/LOSS_CONTINUED) + provisional 필드 추가로 범프.
 *  v2 최종 리뷰 픽스 — 산출값이 실제로 바뀌는 3건이라 범프한다: ① 비12월 결산 종목 Q4 역산의
 *  보고서 페어링 교정(C1) ② 성장(QoQ/YoY) resolution의 provisional 전파(I2) ③ Q4 피연산자
 *  account_id 불일치 경고(I5). 12월 결산 종목의 분기 값과 years[] 연간 값 자체는 무변이다.
 *
 *  v3 V5 — `derivationDetail`(산식 구조화) 추가. **산출값은 전 종목·전 지표 무변**이고(before/after
 *  전수 비교로 확인) 순수 additive지만, derived.json의 스키마가 달라졌으므로 소비 측이 재생성
 *  필요 여부를 판단할 수 있도록 범프한다. */
export const PARSER_VERSION = "v3v5.0";
