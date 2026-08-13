/**
 * 종목×연도 단위 정규화 오케스트레이터. `public/snapshots/*.json`만 읽는다(API 호출 0회).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { DartEnvelope } from "../dart/client";
import {
  ACNT_ALL_CANDIDATES,
  ALOT_MATTER_CANDIDATES,
  GROWTH_KEYS,
  Q4_DERIVABLE_KEYS,
  QUARTER_CUMULATIVE_KEYS,
  QUARTER_EPS_LIKE_KEYS,
  QUARTER_FLOW_KEYS,
  QUARTER_POINT_KEYS,
  SINGL_INDX_CANDIDATES,
  STOCK_TOTQY_CANDIDATES,
} from "./catalog";
import { deriveFcf, deriveOperatingMargin, deriveQ4, deriveQoQ, deriveQuarterCf, deriveRoa, deriveYoY, missingResolution } from "./derive";
import type { AcntAllBody, AcntAllRow, FsDiv } from "./resolve";
import { resolveAcntAllField, resolveFsDiv } from "./resolve";
import type { IndxBody } from "./resolve-indx";
import { resolveIndxMetric } from "./resolve-indx";
import type { AlotBody, AlotColumn } from "./resolve-alotmatter";
import { resolveAlotMatterMetric, resolveDividendPayoutFallback } from "./resolve-alotmatter";
import type { StockTotqyBody } from "./resolve-stocktotqy";
import { resolveStockTotqyMetric } from "./resolve-stocktotqy";
import type { Resolution } from "./types";

/** T3 수집 매트릭스와 동일한 대상 연도. alotMatter는 2025년 보고서 1건이 이 3개년을 전부 커버한다. */
export const YEARS = ["2023", "2024", "2025"] as const;

/** alotMatter는 bsns_year=2025 보고서 1건이 2023~2025 3개년을 전부 커버한다 — T10 SourcePanel requestId 조립에도 재사용된다. */
export const ALOT_MATTER_REPORT_YEAR = "2025";
const ALOT_COLUMN_BY_YEAR: Record<string, AlotColumn> = { "2025": "thstrm", "2024": "frmtrm", "2023": "lwfr" };

export interface StockRef {
  stockCode: string;
  corpCode: string;
  name: string;
}

export interface YearResolutions {
  year: string;
  fsDiv: FsDiv;
  fsDivFallbackApplied: boolean;
  resolutions: Record<string, Resolution>;
}

export interface StockDerived extends StockRef {
  years: YearResolutions[];
  /** v2 T2 — additive. quarters[]가 비정상이어도 years[]는 절대 영향받지 않는다(별도 함수·별도 루프). */
  quarters: QuarterResolutions[];
  coverage: { candidates: number; hit: number };
}

function loadSnapshot<T>(dir: string, requestId: string): DartEnvelope<T> | null {
  const p = join(dir, `${requestId}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as DartEnvelope<T>;
}

export interface ReportResolution {
  fsDiv: FsDiv;
  fsDivFallbackApplied: boolean;
  list: AcntAllRow[];
}

/**
 * v2 T2 — `fnlttSinglAcntAll` 특정 reprt_code 보고서 하나를 CFS→OFS 폴백까지 포함해 로드한다.
 * 기존 연간(11011) 로직과 3Q(11014) 조회 로직을 공통화했다(리뷰 대상 :56-57·:67 두 곳). 각
 * 호출이 자기 reprt_code로 독립적인 CFS→OFS 폴백을 수행한다 — 실측 확인 결과(2023~2025 3개년
 * 전체) 11011 폴백 여부와 11014 폴백 여부가 항상 일치해 기존 "11011의 fsDiv를 11014 조회에
 * 재사용" 방식과 결과가 동일하다(회귀 0건, engine.test.ts로 고정). 분기 축(resolveStockQuarter)은
 * reprt마다 실제로 fsDiv가 갈릴 수 있어(예: 특정 분기만 CFS 013) 독립 폴백이 반드시 필요하다.
 */
export function resolveFromReport(dir: string, stock: StockRef, year: string, reprtCode: string): ReportResolution {
  const reqId = (fs: FsDiv) => `fnlttSinglAcntAll__${stock.corpCode}__${year}__${reprtCode}__${fs}`;
  const fsRes = resolveFsDiv(
    () => loadSnapshot<AcntAllBody>(dir, reqId("CFS")),
    () => loadSnapshot<AcntAllBody>(dir, reqId("OFS")),
  );
  return { fsDiv: fsRes.fsDiv, fsDivFallbackApplied: fsRes.fsDivFallbackApplied, list: fsRes.envelope?.body.list ?? [] };
}

export function resolveStockYear(dir: string, stock: StockRef, year: string): YearResolutions {
  const annual = resolveFromReport(dir, stock, year, "11011");

  const resolutions: Record<string, Resolution> = {};
  for (const c of ACNT_ALL_CANDIDATES) {
    resolutions[c.key] = resolveAcntAllField(c, annual.list, "thstrm_amount", annual.fsDiv, annual.fsDivFallbackApplied);
  }

  // 4Q 역산 — 11014(3분기) 스냅샷을 읽어 thstrm_add_amount(누적)를 뺀다.
  const q3 = resolveFromReport(dir, stock, year, "11014");
  for (const key of Q4_DERIVABLE_KEYS) {
    const candidate = ACNT_ALL_CANDIDATES.find((c) => c.key === key);
    if (!candidate) continue;
    const q3Res = resolveAcntAllField(candidate, q3.list, "thstrm_add_amount", q3.fsDiv, q3.fsDivFallbackApplied);
    resolutions[`q4_${key}`] = deriveQ4(`q4_${key}`, resolutions[key], q3Res);
  }

  const fsRes = { fsDiv: annual.fsDiv, fsDivFallbackApplied: annual.fsDivFallbackApplied };

  resolutions.roa = deriveRoa(resolutions.net_income, resolutions.total_assets);
  resolutions.operating_margin = deriveOperatingMargin(resolutions.operating_income, resolutions.revenue);
  resolutions.fcf = deriveFcf(resolutions.operating_cf, resolutions.capex);

  for (const c of SINGL_INDX_CANDIDATES) {
    const envelope = loadSnapshot<IndxBody>(dir, `fnlttSinglIndx__${stock.corpCode}__${year}__11011__${c.idxClCode}`);
    resolutions[c.key] = resolveIndxMetric(c, envelope, fsRes.fsDiv, fsRes.fsDivFallbackApplied);
  }

  const alotEnvelope = loadSnapshot<AlotBody>(dir, `alotMatter__${stock.corpCode}__${ALOT_MATTER_REPORT_YEAR}__11011`);
  const column = ALOT_COLUMN_BY_YEAR[year];
  for (const c of ALOT_MATTER_CANDIDATES) {
    resolutions[c.key] = resolveAlotMatterMetric(c, alotEnvelope, column, fsRes.fsDiv, fsRes.fsDivFallbackApplied);
  }
  resolutions.dividend_payout_fallback = resolveDividendPayoutFallback(alotEnvelope, column, fsRes.fsDiv, fsRes.fsDivFallbackApplied);

  const stockTotqyEnvelope = loadSnapshot<StockTotqyBody>(dir, `stockTotqySttus__${stock.corpCode}__${year}__11011`);
  for (const c of STOCK_TOTQY_CANDIDATES) {
    resolutions[c.key] = resolveStockTotqyMetric(c, stockTotqyEnvelope, fsRes.fsDiv, fsRes.fsDivFallbackApplied);
  }

  return { year, fsDiv: fsRes.fsDiv, fsDivFallbackApplied: fsRes.fsDivFallbackApplied, resolutions };
}

/* -------------------------------------------------------------------------------------------- */
/* v2 T2 — 분기 축 (additive, years[]는 위 로직 그대로 무변경)                                     */
/* -------------------------------------------------------------------------------------------- */

/** T1(스냅샷 수집 확장)이 실제로 수집한 acntAll 대상 연도 — indx/alotMatter/stockTotqy는 분기 미수집이라 YEARS(3개년) 그대로다. */
export const QUARTER_YEARS = ["2023", "2024", "2025", "2026"] as const;

const QUARTER_REPRT_BY_NUM: Record<1 | 2 | 3 | 4, "11013" | "11012" | "11014" | "11011"> = {
  1: "11013",
  2: "11012",
  3: "11014",
  4: "11011",
};

/** CF 단일분기화에 필요한 "직전 reprt" — Q1은 직전이 없다(그 자체가 누적=단일). */
const QUARTER_PRIOR_REPRT_FOR_CF: Record<2 | 3 | 4, "11013" | "11012" | "11014"> = {
  2: "11013",
  3: "11012",
  4: "11014",
};

/** 최상위 `derived.json.quarters` — 구조적으로 "요청 대상" 전체 목록이다(연간 YEARS와 동일 성격: 실제 값 존재 여부는 종목별 resolutions가 따로 말한다). */
export const ALL_QUARTER_PERIODS: string[] = QUARTER_YEARS.flatMap((y) => ([1, 2, 3, 4] as const).map((q) => `${y}Q${q}`));

export interface QuarterResolutions {
  /** 정렬·조회 키. bsnsYear+quarter 기반이라 신영증권처럼 비12월 결산 종목의 "제N기"와 어긋날 수 있다 — fiscalPeriodName 참조. */
  period: string;
  bsnsYear: string;
  quarter: 1 | 2 | 3 | 4;
  reprtCode: "11013" | "11012" | "11014" | "11011";
  /** thstrm_nm 원문(예: "제 56 기 1분기말"). 신영증권처럼 bsns_year만으로 기수가 안 맞는 종목의 실제 라벨을 그대로 노출한다(T1V 판정5). */
  fiscalPeriodName: string;
  fsDiv: FsDiv;
  fsDivFallbackApplied: boolean;
  resolutions: Record<string, Resolution>;
}

/** Q4 역산 결과에 provisional 마킹 + (EPS류라면) 잠정 사유 문구를 derivation에 덧붙인다. MISSING이면 그대로 통과. */
function finalizeQuarterFlowQ4(key: string, annualRes: Resolution, q3CumulativeRes: Resolution): Resolution {
  const derived = deriveQ4(key, annualRes, q3CumulativeRes);
  if (derived.displayState !== "OK") return derived;
  const withProvisional: Resolution = { ...derived, provisional: true };
  if ((QUARTER_EPS_LIKE_KEYS as readonly string[]).includes(key)) {
    return { ...withProvisional, derivation: `${withProvisional.derivation} — 가중평균주식수 변동으로 근사치일 수 있음(잠정치)` };
  }
  return withProvisional;
}

/**
 * 종목×연도×분기 단위 정규화. 계정 분류(QUARTER_FLOW_KEYS/QUARTER_POINT_KEYS/QUARTER_CUMULATIVE_KEYS)별로
 * T1V가 확정한 규약을 그대로 적용한다(catalog.ts 주석 참조). 스냅샷이 013이거나 파일 자체가 없으면
 * `resolveFromReport`가 빈 list를 반환해 각 candidate가 자연히 MISSING으로 떨어진다 — 이 함수는
 * "없으면 만들지 않는다"가 아니라 "모든 (연도,분기) 조합을 항상 만들고 결측은 MISSING으로 표기한다"를
 * 택했다(연간 엔진의 기존 선례 — 신영증권 FY2023 전체 MISSING도 year 엔트리 자체는 생성됨 — 와 동일한
 * 설계 일관성, task-T2-report.md §설계결정 참조).
 */
export function resolveStockQuarter(dir: string, stock: StockRef, bsnsYear: string, quarter: 1 | 2 | 3 | 4): QuarterResolutions {
  const reprtCode = QUARTER_REPRT_BY_NUM[quarter];
  const primary = resolveFromReport(dir, stock, bsnsYear, reprtCode);
  const fiscalPeriodName = primary.list[0]?.thstrm_nm ?? "";
  const resolutions: Record<string, Resolution> = {};

  // IS/CIS 흐름 — Q1~Q3 thstrm 직독, Q4 = FY.thstrm − Q3.thstrm_add(deriveQ4 재사용).
  const q3ForQ4 = quarter === 4 ? resolveFromReport(dir, stock, bsnsYear, "11014") : null;
  for (const key of QUARTER_FLOW_KEYS) {
    const candidate = ACNT_ALL_CANDIDATES.find((c) => c.key === key);
    if (!candidate) continue;
    if (quarter === 4 && q3ForQ4) {
      const annualRes = resolveAcntAllField(candidate, primary.list, "thstrm_amount", primary.fsDiv, primary.fsDivFallbackApplied);
      const q3Res = resolveAcntAllField(candidate, q3ForQ4.list, "thstrm_add_amount", q3ForQ4.fsDiv, q3ForQ4.fsDivFallbackApplied);
      resolutions[key] = finalizeQuarterFlowQ4(key, annualRes, q3Res);
    } else {
      resolutions[key] = resolveAcntAllField(candidate, primary.list, "thstrm_amount", primary.fsDiv, primary.fsDivFallbackApplied);
    }
  }

  // BS 시점 — 차분·역산 금지, 각 분기말 thstrm 직독.
  for (const key of QUARTER_POINT_KEYS) {
    const candidate = ACNT_ALL_CANDIDATES.find((c) => c.key === key);
    if (!candidate) continue;
    resolutions[key] = resolveAcntAllField(candidate, primary.list, "thstrm_amount", primary.fsDiv, primary.fsDivFallbackApplied);
  }

  // CF 누적 — Q1은 그 자체가 단일분기, Q2~Q4는 인접 reprt와 차분(deriveQuarterCf).
  const priorReprtForCf = quarter === 1 ? null : QUARTER_PRIOR_REPRT_FOR_CF[quarter];
  const priorForCf = priorReprtForCf ? resolveFromReport(dir, stock, bsnsYear, priorReprtForCf) : null;
  for (const key of QUARTER_CUMULATIVE_KEYS) {
    const candidate = ACNT_ALL_CANDIDATES.find((c) => c.key === key);
    if (!candidate) continue;
    const currentCum = resolveAcntAllField(candidate, primary.list, "thstrm_amount", primary.fsDiv, primary.fsDivFallbackApplied);
    if (!priorForCf) {
      resolutions[key] = currentCum;
      continue;
    }
    const priorCum = resolveAcntAllField(candidate, priorForCf.list, "thstrm_amount", priorForCf.fsDiv, priorForCf.fsDivFallbackApplied);
    const diff = deriveQuarterCf(key, `Q${quarter}(CF)`, currentCum, priorCum);
    resolutions[key] = diff.displayState === "OK" ? { ...diff, provisional: true } : diff;
  }

  return {
    period: `${bsnsYear}Q${quarter}`,
    bsnsYear,
    quarter,
    reprtCode,
    fiscalPeriodName,
    fsDiv: primary.fsDiv,
    fsDivFallbackApplied: primary.fsDivFallbackApplied,
    resolutions,
  };
}

/** "2024Q1" → "2023Q4"(연도 경계 포함), "2024Q2" → "2024Q1". QoQ 비교 대상 조회 키 생성용.
 *  v2 T6 — resolveFinExtrasQuarters.ts가 금융 확장 손익(fin extras) 분기 QoQ에 동일 로직을
 *  재사용하려고 export했다(중복 정의 방지). */
export function previousPeriod(period: string): string {
  const m = /^(\d{4})Q([1-4])$/.exec(period);
  if (!m) return period;
  const year = Number(m[1]);
  const q = Number(m[2]);
  return q === 1 ? `${year - 1}Q4` : `${year}Q${q - 1}`;
}

/**
 * 종목의 16개 (연도×분기) 엔트리를 전부 만든 뒤, 이미 계산된 이웃 분기 resolutions를 재사용해
 * QoQ/YoY를 2차 패스로 채운다(원장을 다시 읽지 않는다 — resolveStockQuarter가 이미 계산한 값을
 * 재료로 쓴다). 비교 대상 분기가 데이터셋 밖(예: 2023Q1의 직전분기 2022Q4)이면 missingResolution으로
 * MISSING을 만든다.
 */
export function resolveStockQuarters(dir: string, stock: StockRef): QuarterResolutions[] {
  const quarters: QuarterResolutions[] = [];
  for (const year of QUARTER_YEARS) {
    for (const q of [1, 2, 3, 4] as const) {
      quarters.push(resolveStockQuarter(dir, stock, year, q));
    }
  }

  const byPeriod = new Map(quarters.map((q) => [q.period, q]));
  for (const q of quarters) {
    const prevQuarter = byPeriod.get(previousPeriod(q.period));
    const yoyQuarter = byPeriod.get(`${Number(q.bsnsYear) - 1}Q${q.quarter}`);

    for (const key of GROWTH_KEYS) {
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

/** 후보 대비 HIT 수 커버리지 — displayState === "OK"(=화면에 그려지는 것)를 HIT으로 집계한다. */
export function resolveStock(dir: string, stock: StockRef): StockDerived {
  const years = YEARS.map((y) => resolveStockYear(dir, stock, y));
  let candidates = 0;
  let hit = 0;
  for (const y of years) {
    for (const r of Object.values(y.resolutions)) {
      candidates++;
      if (r.displayState === "OK") hit++;
    }
  }
  // coverage는 연간(years[]) 집계 그대로 둔다 — 분기(2026 등 대부분 MISSING인 미래분기 다수 포함)를
  // 섞으면 기존 "삼성전자 커버리지 90%↑" 류 회귀 테스트 임계값이 흔들린다(additive 원칙 위반 방지).
  const quarters = resolveStockQuarters(dir, stock);
  return { stockCode: stock.stockCode, corpCode: stock.corpCode, name: stock.name, years, quarters, coverage: { candidates, hit } };
}
