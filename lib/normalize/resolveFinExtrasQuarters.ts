/**
 * 금융 프로필(FIN_HOLDING·FIN_SECURITIES·FIN_INSURANCE) 확장 손익(fin extras)의 분기 축 (T6).
 *
 * `resolveFinExtras.ts`(T2, 단일 보고서 읽기)와 `resolveProfileExtras.ts`(프로필→카탈로그
 * 디스패치)를 재료로, `lib/normalize/engine.ts`의 `resolveStockQuarter`/`resolveStockQuarters`가
 * base 계정(revenue·operating_income 등)에 하던 것과 동일한 구조(16분기 전체 생성 → Q4 역산 →
 * QoQ/YoY 2차 패스)를 fin extras 3종(net_interest_income·net_fee_income·insurance_result)에
 * 복제한다. `data/derived.json`에는 기록하지 않는다(T2/T10과 동일 원칙 — 요청 시점 계산).
 *
 * 계정 선택은 extraCandidatesFor(profile)이 이미 account_id 기준으로 확정한다 — 이 파일은 그
 * 후보 목록을 어떤 reprtCode로 읽을지만 결정한다(브리프 §T1V "계정명만으로는 오매칭" 원칙은
 * 카탈로그 쪽 책임, 여기선 재확인하지 않는다).
 */
import { previousPeriod, QUARTER_YEARS } from "./engine";
import { deriveQ4, deriveQoQ, deriveYoY, missingResolution } from "./derive";
import { resolveFinExtras } from "./resolveFinExtras";
import { extraCandidatesFor } from "./resolveProfileExtras";
import type { ProfileId, Resolution } from "./types";

const QUARTER_REPRT_BY_NUM: Record<1 | 2 | 3 | 4, "11013" | "11012" | "11014" | "11011"> = {
  1: "11013",
  2: "11012",
  3: "11014",
  4: "11011",
};

/**
 * fin extras 중 QoQ/YoY 꺾은선을 그리는 대상 — 브리프 지정 3종(순이자손익·순수수료손익·보험손익).
 * FIN_SECURITIES처럼 특정 프로필 카탈로그에 `insurance_result` 후보 자체가 없으면
 * `resolutions`에서 그 키가 애초에 만들어지지 않아(아래 루프가 candidates를 순회) 자동으로
 * 제외된다 — 별도 방어 코드가 필요 없다(NOT_IN_PROFILE 게이팅과 동일 취지).
 */
const FIN_EXTRA_GROWTH_KEYS = ["net_interest_income", "net_fee_income", "insurance_result"] as const;

export interface FinExtraQuarterResolutions {
  period: string;
  resolutions: Record<string, Resolution>;
}

/**
 * 분기 하나(bsnsYear+quarter)의 fin extras resolutions. Q1~Q3는 해당 reprtCode를
 * `thstrm_amount`로 직독하고, Q4는 연간(11011)−3Q누적(11014.thstrm_add_amount)을
 * `deriveQ4`로 역산해 `provisional: true`를 붙인다 — `engine.ts`의
 * `finalizeQuarterFlowQ4`와 동일한 규약(IS/CIS 흐름 계정이므로 base 엔진과 같은 취급).
 */
function resolveFinExtrasForQuarter(dir: string, profile: ProfileId, corpCode: string, bsnsYear: string, quarter: 1 | 2 | 3 | 4): Record<string, Resolution> {
  const candidates = extraCandidatesFor(profile);
  if (candidates.length === 0) return {};

  if (quarter !== 4) {
    return resolveFinExtras(dir, corpCode, bsnsYear, candidates, QUARTER_REPRT_BY_NUM[quarter], "thstrm_amount").resolutions;
  }

  const annual = resolveFinExtras(dir, corpCode, bsnsYear, candidates, "11011", "thstrm_amount").resolutions;
  const q3Cumulative = resolveFinExtras(dir, corpCode, bsnsYear, candidates, "11014", "thstrm_add_amount").resolutions;
  const resolutions: Record<string, Resolution> = {};
  for (const c of candidates) {
    const derived = deriveQ4(c.key, annual[c.key], q3Cumulative[c.key]);
    resolutions[c.key] = derived.displayState === "OK" ? { ...derived, provisional: true } : derived;
  }
  return resolutions;
}

/**
 * 프로필의 fin extras 16분기(2023Q1~2026Q4) 전체 + QoQ/YoY 2차 패스. `extraCandidatesFor(profile)`이
 * 빈 배열이면(STANDARD 등) 파일 I/O 없이 즉시 `[]`를 반환한다(resolveProfileExtras와 동일한
 * 조기 반환 관례).
 */
export function resolveProfileExtrasQuarters(dir: string, profile: ProfileId, corpCode: string): FinExtraQuarterResolutions[] {
  if (extraCandidatesFor(profile).length === 0) return [];

  const quarters: FinExtraQuarterResolutions[] = [];
  for (const year of QUARTER_YEARS) {
    for (const q of [1, 2, 3, 4] as const) {
      quarters.push({ period: `${year}Q${q}`, resolutions: resolveFinExtrasForQuarter(dir, profile, corpCode, year, q) });
    }
  }

  const byPeriod = new Map(quarters.map((q) => [q.period, q]));
  for (const q of quarters) {
    const m = /^(\d{4})Q([1-4])$/.exec(q.period)!;
    const bsnsYear = Number(m[1]);
    const quarterNum = m[2];
    const prevQuarter = byPeriod.get(previousPeriod(q.period));
    const yoyQuarter = byPeriod.get(`${bsnsYear - 1}Q${quarterNum}`);

    for (const key of FIN_EXTRA_GROWTH_KEYS) {
      const current = q.resolutions[key];
      if (!current) continue;
      const prevRes = prevQuarter?.resolutions[key] ?? missingResolution(key, current);
      const yoyRes = yoyQuarter?.resolutions[key] ?? missingResolution(key, current);
      q.resolutions[`qoq_${key}`] = deriveQoQ(`qoq_${key}`, current, prevRes);
      q.resolutions[`yoy_${key}`] = deriveYoY(`yoy_${key}`, current, yoyRes);
    }
  }

  return quarters;
}
