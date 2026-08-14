/**
 * 파생 지표 계산기 — 이미 resolve된 `Resolution`들을 입력으로 받아 새 `Resolution`을 만든다.
 * 두 입력 중 하나라도 `normalized === null`이면 MISSING, 비율 지표는 분모 ≤ 0이면 NA_NEGATIVE_BASE.
 */

import { formatAmount } from "./parse";
import { PARSER_VERSION } from "./types";
import type { DerivationStep, Resolution } from "./types";

function baseOf(metricKey: string, from: Resolution) {
  return {
    metricKey,
    attempts: [] as Resolution["attempts"],
    fsDiv: from.fsDiv,
    fsDivFallbackApplied: from.fsDivFallbackApplied,
    parserVersion: PARSER_VERSION,
  };
}

/* -------------------------------------------------------------------------------------------- */
/* v3 V5 — 산식 구조화(derivationDetail)                                                          */
/* -------------------------------------------------------------------------------------------- */

/**
 * 파생 함수가 결과 `derivationDetail`을 채우는 데 필요한 **사람용 라벨**. 값 계산에는 일절
 * 관여하지 않는다(산출값 무변이 이 태스크의 회귀 기준이다).
 *
 * 엔진은 지표의 한글 이름도, 피연산자가 어느 보고서에서 왔는지도 모른다 — 둘 다 호출부(engine.ts ·
 * resolveFinExtrasQuarters.ts)가 카탈로그와 reprt_code를 이미 손에 쥔 채 부른다. 그래서 라벨만
 * 주입받고, 생략되면 키 기준 기본값으로 떨어진다(단위 테스트 호출부가 무수정으로 통과해야 하므로
 * 옵셔널이다).
 */
export type DerivationLabels = {
  /** 결과 지표의 한글 이름 — "영업이익". 기간 접두("24.4Q")는 화면이 붙인다(types.ts 주석). */
  result: string;
  /** 기준(왼쪽) 피연산자 — "2024 사업보고서 연간". */
  left: string;
  /** 결합(오른쪽) 피연산자 — "2024 3분기보고서 누적". */
  right: string;
};

function labelsOr(metricKey: string, left: string, right: string, labels?: DerivationLabels): DerivationLabels {
  return labels ?? { result: metricKey, left, right };
}

/** 백분율 환산 상수 step — 비율 지표 3종(ROA·영업이익률·성장률)과 배당성향 fallback이 공유한다. */
const PERCENT_STEP: DerivationStep = { label: "백분율 환산", value: 100, op: "mul", unit: "SCALAR" };

/**
 * Q4 역산 = 11011.thstrm_amount − 11014.thstrm_add_amount (#39).
 * BS(시점 데이터)는 호출부에서 애초에 이 함수를 쓰지 않는다 — IS/CIS 흐름 계정만 대상.
 *
 * 최종 리뷰 픽스(I5): 두 피연산자는 각자 독립적으로 폴백 체인을 돌기 때문에 **서로 다른
 * `account_id`에 HIT할 수 있다**. 실측 3건 — NAVER 2023·카카오 2025 `eps_basic`(연간은
 * `…PerShareFromContinuingOperations`(계속영업), 11014는 `…PerShare`(전체)), KB금융 2023
 * `operating_income`(연간 `dart_OperatingIncomeLoss`, 11014엔 그 행이 없어
 * `ifrs-full_ProfitLossFromOperatingActivities`). 원본에 짝이 맞는 조합이 아예 없는 경우라
 * MISSING으로 떨어뜨리면 멀쩡한 분기까지 통째로 사라진다 — 값은 남기되 `derivation`에 어떤 두
 * 계정을 뺐는지 명시하고 `provisional`로 표시해 화면에서 확정치와 구분되게 한다.
 */
export function deriveQ4(metricKey: string, annual: Resolution, q3Cumulative: Resolution, labels?: DerivationLabels): Resolution {
  const base = baseOf(metricKey, annual);
  if (annual.normalized === null || q3Cumulative.normalized === null) {
    return { ...base, normalized: null, displayState: "MISSING" };
  }
  const value = annual.normalized - q3Cumulative.normalized;
  const derivation = `Q4 = ${formatAmount(annual.normalized)} − ${formatAmount(q3Cumulative.normalized)}`;
  const l = labelsOr(metricKey, "사업보고서 연간", "3분기보고서 누적", labels);
  const steps: DerivationStep[] = [
    { label: l.left, value: annual.normalized },
    { label: l.right, value: q3Cumulative.normalized, op: "minus" },
  ];
  const annualAccountId = annual.hit?.accountId;
  const q3AccountId = q3Cumulative.hit?.accountId;
  if (annualAccountId && q3AccountId && annualAccountId !== q3AccountId) {
    const caveat = `연간(${annualAccountId})과 3분기 누적(${q3AccountId})의 계정이 달라 두 값의 개념이 어긋날 수 있음(잠정치)`;
    return {
      ...base,
      normalized: value,
      displayState: "OK",
      provisional: true,
      derivation: `${derivation} — 주의: ${caveat}`,
      derivationDetail: { kind: "q4_reverse", resultLabel: l.result, steps, unit: "KRW", caveat },
    };
  }
  return { ...base, normalized: value, displayState: "OK", derivation, derivationDetail: { kind: "q4_reverse", resultLabel: l.result, steps, unit: "KRW" } };
}

function ratioMetric(
  metricKey: string,
  numerator: Resolution,
  denominator: Resolution,
  scale: number,
  label: string,
  labels: DerivationLabels,
  /** 값은 정상이지만 피연산자 선택에 단서가 붙은 경우(v4 귀속계정 폴백). `deriveQ4`와 같은 표기 규약. */
  caveat?: string,
): Resolution {
  const base = baseOf(metricKey, numerator);
  if (numerator.normalized === null || denominator.normalized === null) {
    return { ...base, normalized: null, displayState: "MISSING" };
  }
  if (denominator.normalized <= 0) {
    return { ...base, normalized: null, displayState: "NA_NEGATIVE_BASE" };
  }
  const value = (numerator.normalized / denominator.normalized) * scale;
  const derivation = `${label} = ${formatAmount(numerator.normalized)} ÷ ${formatAmount(denominator.normalized)} × ${scale}`;
  return {
    ...base,
    normalized: value,
    displayState: "OK",
    derivation: caveat ? `${derivation} — 주의: ${caveat}` : derivation,
    derivationDetail: {
      kind: "ratio",
      resultLabel: labels.result,
      steps: [
        { label: labels.left, value: numerator.normalized },
        { label: labels.right, value: denominator.normalized, op: "div" },
        // scale은 지금 전 호출부가 100이지만 파라미터이므로 상수를 박지 않고 실제 값을 싣는다.
        { ...PERCENT_STEP, value: scale },
      ],
      unit: "PCT",
      ...(caveat ? { caveat } : {}),
    },
  };
}

/** ROA = 당기순이익 ÷ 자산총계 × 100. `M212000`(총자산영업이익률)은 영업이익 기준이라 ROA가 아니다. */
export function deriveRoa(netIncome: Resolution, totalAssets: Resolution): Resolution {
  return ratioMetric("roa", netIncome, totalAssets, 100, "ROA(%)", { result: "ROA", left: "당기순이익(총액)", right: "자산총계" });
}

/* -------------------------------------------------------------------------------------------- */
/* v4 — ROE 산정기준 2종 (기존 `roe`는 DART M211550 직독이라 여기 없다)                            */
/* -------------------------------------------------------------------------------------------- */

/**
 * 지배기업 소유주 귀속 계정이 없으면 총액으로 폴백한다.
 *
 * 두 경우에 귀속 행이 아예 없는데 **둘 다 총액 = 귀속분이 정의상 성립**해서 폴백이 근사가 아니다:
 * ① 연결재무제표 미작성(OFS 전용 — 앱클론)은 지배/비지배 구분 자체가 없다. ② 종속기업을 100%
 * 소유해 비지배지분이 0인 회사(신라젠)는 귀속 손익 행이 생략된다(귀속 자본은 자본총계와 동일한
 * 값으로 존재).
 *
 * 실측 17종목 커버리지 — 귀속 자본 16/17 · 귀속 손익 15/17.
 */
function ownersOrTotal(attributable: Resolution, total: Resolution): { resolution: Resolution; fellBack: boolean } {
  return attributable.normalized !== null ? { resolution: attributable, fellBack: false } : { resolution: total, fellBack: true };
}

const OWNERS_FALLBACK_CAVEAT =
  "지배기업 소유주 귀속 계정이 없어 총액으로 대체했다 — 연결 미작성(별도재무제표)이거나 비지배지분이 0인 회사라 두 값은 정의상 같다.";

function ownersCaveat(...picks: { fellBack: boolean }[]): string | undefined {
  return picks.some((p) => p.fellBack) ? OWNERS_FALLBACK_CAVEAT : undefined;
}

/**
 * **ROE(지배기업 소유주 귀속 기준)** = 지배기업 소유주 귀속 당기순이익 ÷ 기말 지배기업 소유주 귀속 자본 × 100.
 *
 * 이띠 요구사항 문서가 지정한 정본 기준이다 — 투자자앱 목업 v21.5 재무비율 카드의
 * `ROE (지배주주·기말 기준)`, 상세구현명세 별도부록 V-08의 *"ROE·EPS 지배주주 기준 우선"*.
 * 삼성전자 FY2025로 계산하면 10.43%로 목업 표기 `10.4%`와 일치한다.
 *
 * DART 산출지표 `M211550`(기존 `roe` 키)과는 **분자·분모가 둘 다 다르다**: 저쪽은 비지배 몫을
 * 포함한 당기순이익을 평균 자본총계로 나눈다(실측 24/24 재현). 자본이 급증한 해에는 평균 분모가
 * 기말보다 작아 격차가 커진다 — SK하이닉스 FY2025는 비지배지분이 0.12%뿐인데도 8.53%p 벌어진다.
 */
export function deriveRoeOwners(
  netIncomeAttributable: Resolution,
  netIncomeTotal: Resolution,
  equityAttributable: Resolution,
  totalEquity: Resolution,
): Resolution {
  const num = ownersOrTotal(netIncomeAttributable, netIncomeTotal);
  const den = ownersOrTotal(equityAttributable, totalEquity);
  return ratioMetric("roe_owners", num.resolution, den.resolution, 100, "ROE(지배기업 소유주 귀속)(%)", {
    result: "ROE(지배기업 소유주 귀속 기준)",
    left: num.fellBack ? "당기순이익(총액 — 귀속 계정 없음)" : "당기순이익(지배기업 소유주 귀속)",
    right: den.fellBack ? "자본총계(총액 — 귀속 계정 없음)" : "지배기업 소유주 귀속 자본(기말)",
  }, ownersCaveat(num, den));
}

/**
 * **ROE(지배기업 소유주 귀속 손익 ÷ 자본총계)** — 이띠 연구원이 실제로 쓰는 혼합 기준이다.
 *
 * `금융업 발라내기.xlsx` FS-A 시트(KB금융 2013~2025)를 역산해 13/13 일치를 확인했다(최대 잔차
 * 0.0040%p, 시트 저장 정밀도 ±0.005 이내). 단 **시트에 수식이 없어 값 적합으로 얻은 추론**이며
 * 원 작성자 확인은 받지 않았다.
 *
 * 분자는 지배주주 몫인데 분모는 비지배지분을 포함한 자본총계라 **분자·분모의 범위가 어긋난다**.
 * 요구사항 문서(위 `deriveRoeOwners`)와 다른 값이 나오며, 비지배지분 비중에 비례해 벌어진다 —
 * FY2025 실측으로 LG화학 1.68%p · 카카오 1.13%p · 삼성전자 0.29%p.
 *
 * 이띠 내부의 명세↔산출물 불일치를 대면미팅에서 숫자로 보여주려고 병기하는 것이므로,
 * **기준이 확정되면 이 지표와 대응 차트는 제거 대상이다.**
 */
export function deriveRoeOwnersOnTotalEquity(
  netIncomeAttributable: Resolution,
  netIncomeTotal: Resolution,
  totalEquity: Resolution,
): Resolution {
  const num = ownersOrTotal(netIncomeAttributable, netIncomeTotal);
  return ratioMetric("roe_owners_on_total_equity", num.resolution, totalEquity, 100, "ROE(귀속손익÷자본총계)(%)", {
    result: "ROE(지배기업 소유주 귀속 손익 ÷ 자본총계)",
    left: num.fellBack ? "당기순이익(총액 — 귀속 계정 없음)" : "당기순이익(지배기업 소유주 귀속)",
    right: "자본총계(기말 · 비지배지분 포함)",
  }, ownersCaveat(num));
}

/**
 * 영업이익률 = 영업이익 ÷ 매출액 × 100.
 * 금융 프로필의 `NOT_IN_PROFILE` 판정은 T7 소관 — T4는 매출액이 NO_ROW인 회사는 그대로 MISSING을
 * 반환한다(입력값 자체가 없으므로). 결과적으로 revenue가 없는 금융업은 이 지표도 MISSING이 된다.
 */
export function deriveOperatingMargin(operatingIncome: Resolution, revenue: Resolution): Resolution {
  return ratioMetric("operating_margin", operatingIncome, revenue, 100, "영업이익률(%)", { result: "영업이익률", left: "영업이익", right: "매출액" });
}

/** FCF = 영업활동현금흐름 − CAPEX. FCF 자체는 음수여도 정상값이므로 NA_NEGATIVE_BASE 대상이 아니다. */
export function deriveFcf(operatingCf: Resolution, capex: Resolution): Resolution {
  const base = baseOf("fcf", operatingCf);
  if (operatingCf.normalized === null || capex.normalized === null) {
    return { ...base, normalized: null, displayState: "MISSING" };
  }
  const value = operatingCf.normalized - capex.normalized;
  return {
    ...base,
    normalized: value,
    displayState: "OK",
    derivation: `FCF = ${formatAmount(operatingCf.normalized)} − ${formatAmount(capex.normalized)}`,
    derivationDetail: {
      kind: "fcf",
      resultLabel: "잉여현금흐름(FCF)",
      steps: [
        { label: "영업활동현금흐름", value: operatingCf.normalized },
        { label: "설비투자(CAPEX, 유형자산 취득)", value: capex.normalized, op: "minus" },
      ],
      unit: "KRW",
      // capex 부호 미정규화는 v1부터의 알려진 미해결 이월 사항이다(global-constraints §알려진 예외).
      // 원문이 음수(유출을 −로 신고)인 종목은 뺄셈이 덧셈이 돼 FCF가 과대 계산된다 — 종목을
      // 하드코딩하지 않고 실제 부호로만 판정해서, 해당하는 종목에서만 경고가 붙는다.
      caveat: capex.normalized < 0 ? "CAPEX 원문이 음수(유출을 −로 신고)라 뺄셈이 덧셈으로 작용한다 — 부호 미정규화(알려진 미해결 이월)" : undefined,
    },
  };
}

/* -------------------------------------------------------------------------------------------- */
/* v2 T2 — 분기 축 파생 (CF 단일분기화, QoQ/YoY)                                                  */
/* -------------------------------------------------------------------------------------------- */

/**
 * CF(누적) 단일분기화 = 당기 reprt.thstrm − 직전 reprt.thstrm (T1V 판정2). `deriveQ4`와 같은 뺄셈
 * 형태이지만 ① 피연산자가 둘 다 `thstrm_amount`(CF엔 `thstrm_add_amount` 필드 자체가 없다) ②
 * 대상 분기가 Q2~Q4로 다양해 derivation 라벨을 호출부가 지정한다(예: "Q2(CF)").
 */
export function deriveQuarterCf(metricKey: string, label: string, current: Resolution, prior: Resolution, labels?: DerivationLabels): Resolution {
  const base = baseOf(metricKey, current);
  if (current.normalized === null || prior.normalized === null) {
    return { ...base, normalized: null, displayState: "MISSING" };
  }
  const value = current.normalized - prior.normalized;
  const l = labelsOr(metricKey, "당분기 누적", "직전분기 누적", labels);
  return {
    ...base,
    normalized: value,
    displayState: "OK",
    derivation: `${label} = ${formatAmount(current.normalized)} − ${formatAmount(prior.normalized)}`,
    derivationDetail: {
      kind: "cf_diff",
      resultLabel: l.result,
      steps: [
        { label: l.left, value: current.normalized },
        { label: l.right, value: prior.normalized, op: "minus" },
      ],
      unit: "KRW",
      caveat: "현금흐름표는 누적으로만 신고돼 인접 분기 차분이 단일분기화의 유일한 경로다(잠정치)",
    },
  };
}

/**
 * QoQ/YoY 공용 계산. 승인 규칙(팀리드 브리프): 직전·당기 둘 다 양수일 때만 통상 %를 계산하고,
 * 그 외 3가지 부호 조합은 흑자전환/적자전환/적자지속 상태로 분류한다 — 그 구간은 %가 왜곡되므로
 * (분모가 0에 가깝거나 음수) 숫자를 아예 감추고 상태만 노출한다(NA_NEGATIVE_BASE와 같은 취지).
 *
 * 최종 리뷰 픽스(I2): 피연산자 중 하나라도 잠정치(Q4 역산·CF 차분)면 결과도 잠정치다 —
 * `baseOf`가 이 플래그를 복사하지 않아 성장 resolution 2,560건 전부 `provisional` 부재였고,
 * 그 결과 승인 규칙 3("잠정치는 점선")의 LineChart 점선이 앱 전체에서 한 번도 발현하지 않았다.
 */
function deriveGrowth(kind: "QoQ" | "YoY", metricKey: string, current: Resolution, previous: Resolution, labels?: DerivationLabels): Resolution {
  // undefined로 두면 JSON 직렬화에서 키 자체가 빠져 기존 산출물 형식과 어긋나지 않는다.
  const base = { ...baseOf(metricKey, current), provisional: current.provisional || previous.provisional || undefined };
  if (current.normalized === null || previous.normalized === null) {
    return { ...base, normalized: null, displayState: "MISSING" };
  }
  const cur = current.normalized;
  const prev = previous.normalized;
  const l = labelsOr(metricKey, "당기", kind === "QoQ" ? "직전분기" : "전년 동분기", labels);
  /** 전환 3종 공용 — 계산이 아니라 "직전 → 당기" 상태 비교라 op이 없고 fold도 정의되지 않는다. */
  const transitionDetail = (reason: string): Resolution["derivationDetail"] => ({
    kind: "growth",
    resultLabel: `${l.result} ${kind}`,
    steps: [
      { label: l.right, value: prev },
      { label: l.left, value: cur },
    ],
    unit: "PCT",
    caveat: `${reason} — 증감률(%)은 분모가 0 이하라 왜곡되므로 산출하지 않고 상태만 표기한다`,
    transition: true,
  });

  if (prev > 0 && cur > 0) {
    const value = ((cur - prev) / Math.abs(prev)) * 100;
    return {
      ...base,
      normalized: value,
      displayState: "OK",
      derivation: `${kind} = (${formatAmount(cur)} − ${formatAmount(prev)}) ÷ |${formatAmount(prev)}| × 100`,
      derivationDetail: {
        kind: "growth",
        resultLabel: `${l.result} ${kind}`,
        steps: [
          { label: l.left, value: cur },
          { label: l.right, value: prev, op: "minus" },
          // 이 분기(prev > 0)에서 |prev| === prev지만, 산식 정의는 절대값이라 라벨로 그 사실을 남긴다.
          { label: `${l.right} 절대값`, value: Math.abs(prev), op: "div" },
          PERCENT_STEP,
        ],
        unit: "PCT",
      },
    };
  }
  if (prev <= 0 && cur > 0) {
    return {
      ...base,
      normalized: null,
      displayState: "TURN_TO_PROFIT",
      derivation: `${kind} 흑자전환: 직전 ${formatAmount(prev)} → 당기 ${formatAmount(cur)}`,
      derivationDetail: transitionDetail("직전 ≤0 → 당기 >0 (흑자전환)"),
    };
  }
  if (prev > 0 && cur <= 0) {
    return {
      ...base,
      normalized: null,
      displayState: "TURN_TO_LOSS",
      derivation: `${kind} 적자전환: 직전 ${formatAmount(prev)} → 당기 ${formatAmount(cur)}`,
      derivationDetail: transitionDetail("직전 >0 → 당기 ≤0 (적자전환)"),
    };
  }
  return {
    ...base,
    normalized: null,
    displayState: "LOSS_CONTINUED",
    derivation: `${kind} 적자지속: 직전 ${formatAmount(prev)} → 당기 ${formatAmount(cur)}`,
    derivationDetail: transitionDetail("직전·당기 모두 ≤0 (적자지속)"),
  };
}

/** QoQ(전분기 대비) — `metricKey`는 호출부가 `qoq_<key>` 형태로 넘긴다. */
export function deriveQoQ(metricKey: string, current: Resolution, previous: Resolution, labels?: DerivationLabels): Resolution {
  return deriveGrowth("QoQ", metricKey, current, previous, labels);
}

/** YoY(전년 동분기 대비) — `metricKey`는 호출부가 `yoy_<key>` 형태로 넘긴다. */
export function deriveYoY(metricKey: string, current: Resolution, previous: Resolution, labels?: DerivationLabels): Resolution {
  return deriveGrowth("YoY", metricKey, current, previous, labels);
}

/** 비교 대상 분기 자체가 데이터셋에 없을 때(예: 2023Q1의 직전분기 2022Q4) QoQ/YoY 입력으로 쓰는 자리표시 MISSING. */
export function missingResolution(metricKey: string, like: Resolution): Resolution {
  return {
    metricKey,
    attempts: [],
    fsDiv: like.fsDiv,
    fsDivFallbackApplied: like.fsDivFallbackApplied,
    normalized: null,
    displayState: "MISSING",
    parserVersion: PARSER_VERSION,
  };
}
