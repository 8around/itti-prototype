/**
 * 7셋 확장 — **단일분기 시계열 빌더**. QoQ 성장률과 "분기별 막대" 차트의 원재료를 만든다.
 *
 * ## reprt_code와 금액 필드의 의미 (삼성전자 2025 CFS 매출액 실측으로 검산)
 *
 * | reprt_code | 보고서 | `thstrm_amount` | `thstrm_add_amount` |
 * |---|---|---|---|
 * | `11013` | 1분기 | **Q1 단독** 79.14조 | 누적 79.14조 (Q1은 동일) |
 * | `11012` | 반기   | **Q2 단독** 74.57조 | 누적 153.71조 |
 * | `11014` | 3분기 | **Q3 단독** 86.06조 | 누적 239.77조 |
 * | `11011` | 사업(연간) | **연간** 333.61조 | 없음(`""`) — #38 |
 *
 * 즉 **Q1~Q3는 역산이 필요 없다**(`thstrm_amount`가 이미 단일분기). Q4만 연간 − 3Q누적으로
 * 역산한다(#39 — DART가 4분기 단독값을 제공하지 않기 때문).
 *
 * 다만 `thstrm_amount`에 누적을 넣어 공시하는 회사가 있을 수 있어, **누적 차분을 교차검증
 * 폴백으로** 함께 계산한다(`add(당분기) − add(직전분기)`). 두 경로가 모두 가능할 때는
 * `thstrm_amount`를 채택하고, 값이 어긋나면 derivation에 그 사실을 남긴다.
 *
 * BS(자산·부채·자본)는 시점 데이터라 분기 차분이 무의미하므로 이 모듈의 대상이 아니다 —
 * 흐름 계정(IS/CIS/CF)만 넣는다.
 */

import { formatAmount } from "./parse";
import type { AcntAllBody, AcntAllRow, FsDiv } from "./resolve";
import { resolveAcntAllField } from "./resolve";
import { PARSER_VERSION } from "./types";
import type { MetricCandidate, Resolution } from "./types";

/** 분기 하나 — `year`+`quarter`가 키, `label`은 차트 x축 표기("25.3Q"). */
export interface QuarterPoint {
  year: string;
  quarter: 1 | 2 | 3 | 4;
  label: string;
  /** 4Q 역산처럼 DART 원본이 아니라 우리가 만든 값이면 true — 차트에서 점선으로 표현한다. */
  provisional: boolean;
  resolution: Resolution;
}

/** 분기 → reprt_code. Q4는 단독 보고서가 없어 연간(11011) − 3분기누적(11014)으로 역산한다. */
const QUARTER_REPRT: Record<1 | 2 | 3, string> = { 1: "11013", 2: "11012", 3: "11014" };
/** 누적 차분 교차검증에 쓸 직전 분기 보고서 (Q1은 직전이 없음). */
const PREV_CUMULATIVE_REPRT: Record<2 | 3, string> = { 2: "11013", 3: "11012" };

export type LoadAcntAll = (year: string, reprtCode: string, fsDiv: FsDiv) => AcntAllBody | null;

function missing(metricKey: string, fsDiv: FsDiv, fsDivFallbackApplied: boolean, reason: string): Resolution {
  return {
    metricKey,
    attempts: [],
    fsDiv,
    fsDivFallbackApplied,
    normalized: null,
    displayState: "MISSING",
    derivation: reason,
    parserVersion: PARSER_VERSION,
  };
}

function rowsOf(body: AcntAllBody | null): AcntAllRow[] {
  // status != "000"이면 list 키 자체가 없다 (#2).
  return body?.status === "000" ? (body.list ?? []) : [];
}

/**
 * Q1~Q3 — `thstrm_amount`(단일분기)를 채택하고, 누적 차분과 어긋나면 derivation에 경고를 남긴다.
 */
function resolveInterimQuarter(
  candidate: MetricCandidate,
  quarter: 1 | 2 | 3,
  year: string,
  load: LoadAcntAll,
  fsDiv: FsDiv,
  fsDivFallbackApplied: boolean,
): Resolution {
  const rows = rowsOf(load(year, QUARTER_REPRT[quarter], fsDiv));
  if (rows.length === 0) {
    return missing(candidate.key, fsDiv, fsDivFallbackApplied, `${year} ${quarter}분기 보고서 미공시 또는 조회 실패`);
  }

  const single = resolveAcntAllField(candidate, rows, "thstrm_amount", fsDiv, fsDivFallbackApplied);
  if (quarter === 1 || single.normalized === null) return single;

  // 누적 차분 교차검증 — 당분기 누적 − 직전 분기 누적.
  const cumulative = resolveAcntAllField(candidate, rows, "thstrm_add_amount", fsDiv, fsDivFallbackApplied);
  const prevRows = rowsOf(load(year, PREV_CUMULATIVE_REPRT[quarter as 2 | 3], fsDiv));
  const prevCumulative = resolveAcntAllField(candidate, prevRows, "thstrm_add_amount", fsDiv, fsDivFallbackApplied);
  if (cumulative.normalized === null || prevCumulative.normalized === null) return single;

  const byDiff = cumulative.normalized - prevCumulative.normalized;
  if (byDiff === single.normalized) return single;
  return {
    ...single,
    derivation:
      `⚠ 단일분기 공시값 ${formatAmount(single.normalized)} 과(와) 누적 차분 ${formatAmount(byDiff)}` +
      ` (= ${formatAmount(cumulative.normalized)} − ${formatAmount(prevCumulative.normalized)}) 불일치 — 공시값을 채택`,
  };
}

/** Q4 = 연간(11011 `thstrm_amount`) − 3분기 누적(11014 `thstrm_add_amount`) (#39). */
function resolveQ4(
  candidate: MetricCandidate,
  year: string,
  load: LoadAcntAll,
  fsDiv: FsDiv,
  fsDivFallbackApplied: boolean,
): Resolution {
  const annualRows = rowsOf(load(year, "11011", fsDiv));
  const q3Rows = rowsOf(load(year, "11014", fsDiv));
  if (annualRows.length === 0 || q3Rows.length === 0) {
    return missing(candidate.key, fsDiv, fsDivFallbackApplied, `${year} 연간 또는 3분기 보고서 미공시 — 4분기 역산 불가`);
  }
  const annual = resolveAcntAllField(candidate, annualRows, "thstrm_amount", fsDiv, fsDivFallbackApplied);
  const q3Cum = resolveAcntAllField(candidate, q3Rows, "thstrm_add_amount", fsDiv, fsDivFallbackApplied);
  if (annual.normalized === null || q3Cum.normalized === null) {
    return missing(candidate.key, fsDiv, fsDivFallbackApplied, `${year} 4분기 역산 입력값 결측`);
  }
  return {
    ...annual,
    metricKey: candidate.key,
    normalized: annual.normalized - q3Cum.normalized,
    displayState: "OK",
    derivation: `${year} Q4 = 연간 ${formatAmount(annual.normalized)} − 3Q누적 ${formatAmount(q3Cum.normalized)} (DART 4분기 단독 미제공)`,
  };
}

/**
 * `from`(포함) ~ `to`(포함) 구간의 단일분기 시계열을 만든다.
 * 결측 분기도 `MISSING` Resolution으로 자리를 남긴다 — 차트에서 "구멍"이 보여야 하기 때문이다.
 */
export function buildQuarterSeries(
  candidate: MetricCandidate,
  range: { from: { year: string; quarter: 1 | 2 | 3 | 4 }; to: { year: string; quarter: 1 | 2 | 3 | 4 } },
  load: LoadAcntAll,
  fsDiv: FsDiv,
  fsDivFallbackApplied: boolean,
): QuarterPoint[] {
  const points: QuarterPoint[] = [];
  let year = Number(range.from.year);
  let quarter = range.from.quarter;
  const endKey = Number(range.to.year) * 10 + range.to.quarter;

  while (year * 10 + quarter <= endKey) {
    const y = String(year);
    const resolution =
      quarter === 4
        ? resolveQ4(candidate, y, load, fsDiv, fsDivFallbackApplied)
        : resolveInterimQuarter(candidate, quarter, y, load, fsDiv, fsDivFallbackApplied);
    points.push({
      year: y,
      quarter,
      label: `${y.slice(2)}.${quarter}Q`,
      provisional: quarter === 4 && resolution.displayState === "OK",
      resolution,
    });
    if (quarter === 4) {
      year += 1;
      quarter = 1;
    } else {
      quarter = (quarter + 1) as 1 | 2 | 3 | 4;
    }
  }
  return points;
}

/** 시계열의 마지막 N개 — "최근 5분기" 같은 화면 요구를 시계열 길이와 무관하게 만족시킨다. */
export function lastN<T>(series: T[], n: number): T[] {
  return series.slice(Math.max(0, series.length - n));
}
