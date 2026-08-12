/**
 * 종목×연도 단위 정규화 오케스트레이터. `public/snapshots/*.json`만 읽는다(API 호출 0회).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { DartEnvelope } from "../dart/client";
import {
  ACNT_ALL_7SETS_CANDIDATES,
  ACNT_ALL_CANDIDATES,
  ALOT_MATTER_CANDIDATES,
  BORROWING_ACCOUNT_IDS,
  CASH_LIKE_KEYS,
  Q4_DERIVABLE_KEYS,
  SINGL_INDX_7SETS_CANDIDATES,
  SINGL_INDX_CANDIDATES,
  STOCK_TOTQY_CANDIDATES,
} from "./catalog";
import {
  deriveBps,
  deriveFcf,
  deriveGrossMargin,
  deriveInterestCoverage,
  deriveNetDebt,
  deriveNetMargin,
  deriveGrowth,
  deriveOperatingMargin,
  deriveQ4,
  deriveRoa,
} from "./derive";
import { parseAmount } from "./parse";
import { buildQuarterSeries } from "./quarters";
import type { QuarterPoint } from "./quarters";
import type { AcntAllBody, AcntAllRow, FsDiv } from "./resolve";
import { resolveAcntAllField, resolveFsDiv } from "./resolve";
import type { IndxBody } from "./resolve-indx";
import { resolveIndxMetric } from "./resolve-indx";
import type { AlotBody, AlotColumn } from "./resolve-alotmatter";
import { resolveAlotMatterMetric, resolveDividendPayoutFallback } from "./resolve-alotmatter";
import type { StockTotqyBody } from "./resolve-stocktotqy";
import { resolveStockTotqyMetric } from "./resolve-stocktotqy";
import { PARSER_VERSION } from "./types";
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
  /** 7셋 확장 — 단일분기 시계열(+QoQ/YoY). 연도 축과 별개의 축이라 years 밖에 둔다. */
  quarters: QuarterSeries[];
  coverage: { candidates: number; hit: number };
}

function loadSnapshot<T>(dir: string, requestId: string): DartEnvelope<T> | null {
  const p = join(dir, `${requestId}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as DartEnvelope<T>;
}

export function resolveStockYear(dir: string, stock: StockRef, year: string): YearResolutions {
  const acntAllReqId = (reprt: string, fs: FsDiv) => `fnlttSinglAcntAll__${stock.corpCode}__${year}__${reprt}__${fs}`;

  const fsRes = resolveFsDiv(
    () => loadSnapshot<AcntAllBody>(dir, acntAllReqId("11011", "CFS")),
    () => loadSnapshot<AcntAllBody>(dir, acntAllReqId("11011", "OFS")),
  );
  const list = fsRes.envelope?.body.list ?? [];

  const resolutions: Record<string, Resolution> = {};
  for (const c of [...ACNT_ALL_CANDIDATES, ...ACNT_ALL_7SETS_CANDIDATES]) {
    resolutions[c.key] = resolveAcntAllField(c, list, "thstrm_amount", fsRes.fsDiv, fsRes.fsDivFallbackApplied);
  }

  // 4Q 역산 — 같은 fsDiv로 11014(3분기) 스냅샷을 읽어 thstrm_add_amount(누적)를 뺀다.
  const q3Envelope = loadSnapshot<AcntAllBody>(dir, acntAllReqId("11014", fsRes.fsDiv));
  const q3List = q3Envelope?.body.status === "000" ? (q3Envelope.body.list ?? []) : [];
  for (const key of Q4_DERIVABLE_KEYS) {
    const candidate = ACNT_ALL_CANDIDATES.find((c) => c.key === key);
    if (!candidate) continue;
    const q3Res = resolveAcntAllField(candidate, q3List, "thstrm_add_amount", fsRes.fsDiv, fsRes.fsDivFallbackApplied);
    resolutions[`q4_${key}`] = deriveQ4(`q4_${key}`, resolutions[key], q3Res);
  }

  resolutions.roa = deriveRoa(resolutions.net_income, resolutions.total_assets);
  resolutions.operating_margin = deriveOperatingMargin(resolutions.operating_income, resolutions.revenue);
  resolutions.fcf = deriveFcf(resolutions.operating_cf, resolutions.capex);

  for (const c of [...SINGL_INDX_CANDIDATES, ...SINGL_INDX_7SETS_CANDIDATES]) {
    const envelope = loadSnapshot<IndxBody>(dir, `fnlttSinglIndx__${stock.corpCode}__${year}__11011__${c.idxClCode}`);
    resolutions[c.key] = resolveIndxMetric(c, envelope, fsRes.fsDiv, fsRes.fsDivFallbackApplied);
  }

  // ── 7셋 확장 파생 ────────────────────────────────────────────────────────
  // 비율 2종은 DART 산출값(fnlttSinglIndx)이 1순위, 결측일 때만 자체 계산으로 폴백한다.
  resolutions.net_margin = preferIndx(resolutions.net_margin_indx, () => deriveNetMargin(resolutions.net_income, resolutions.revenue), "net_margin");
  resolutions.gross_margin = preferIndx(resolutions.gross_margin_indx, () => deriveGrossMargin(resolutions.gross_profit, resolutions.revenue), "gross_margin");
  // 이자보상배율은 DART 산출값(M221600)이 실측상 대부분 결측이라 자체 계산이 사실상 주력이다.
  resolutions.interest_coverage = preferIndx(
    resolutions.interest_coverage_indx,
    () => deriveInterestCoverage(resolutions.operating_income, resolutions.interest_expense),
    "interest_coverage",
  );
  resolutions.net_debt = resolveNetDebt(list, resolutions);

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

  // BPS는 발행주식총수(stockTotqySttus)에 의존하므로 그 해석이 끝난 뒤에 계산한다.
  resolutions.bps = deriveBps(resolutions.equity_attributable_to_owners, resolutions.shares_outstanding);

  return { year, fsDiv: fsRes.fsDiv, fsDivFallbackApplied: fsRes.fsDivFallbackApplied, resolutions };
}

/**
 * DART 산출 지표를 1순위로 채택하고, 결측일 때만 자체 계산으로 폴백한다.
 * 어느 경로가 쓰였는지는 `derivation`으로 구분된다 — DART 산출값은 derivation이 없고,
 * 자체 계산은 "순이익률(%) = … ÷ …" 형태의 산식이 붙는다.
 */
function preferIndx(indxResolution: Resolution | undefined, calculate: () => Resolution, metricKey: string): Resolution {
  if (indxResolution?.displayState === "OK" && indxResolution.normalized !== null) {
    return { ...indxResolution, metricKey, derivation: `DART 산출지표 ${indxResolution.hit?.accountId ?? ""} 값을 그대로 사용` };
  }
  const calculated = calculate();
  return { ...calculated, derivation: calculated.derivation ? `${calculated.derivation} (DART 산출지표 결측 → 자체 계산)` : calculated.derivation };
}

/**
 * 순차입금 — 폴백 체인이 아니라 **합산**이라 별도 처리한다(catalog.ts BORROWING_ACCOUNT_IDS 주석 참조).
 * BS 본표 합계행(`account_detail === "-"`)만 대상으로, 목록에 있는 계정 중 실재하는 것을 전부 더한다.
 */
function resolveNetDebt(list: AcntAllRow[], resolutions: Record<string, Resolution>): Resolution {
  const borrowings: { accountId: string; accountNm: string; value: number }[] = [];
  const attempts: Resolution["attempts"] = [];
  for (const accountId of BORROWING_ACCOUNT_IDS) {
    const row = list.find((r) => r.account_id === accountId && r.account_detail === "-" && r.sj_div === "BS");
    if (!row) {
      attempts.push({ accountId, sjDiv: "BS", result: "NO_ROW" });
      continue;
    }
    const value = parseAmount(row.thstrm_amount);
    if (value === null) {
      attempts.push({ accountId, sjDiv: "BS", result: "EMPTY_VALUE" });
      continue;
    }
    attempts.push({ accountId, sjDiv: "BS", result: "HIT" });
    borrowings.push({ accountId, accountNm: row.account_nm, value });
  }
  const cashLike = CASH_LIKE_KEYS.map((k) => resolutions[k]).filter(Boolean);
  return deriveNetDebt(borrowings, attempts, cashLike, resolutions.total_assets);
}

/**
 * 분기 시계열 대상 — 흐름(IS/CIS) 계정만. BS 항목은 시점 데이터라 분기 단독값 개념이 없다(#39).
 * EPS는 분기 단독 EPS가 공시되므로 포함한다(학습가이드 "EPS 차트 추가" 요구).
 */
export const QUARTER_SERIES_KEYS = ["revenue", "operating_income", "net_income_attributable_to_owners", "eps_basic"] as const;

/**
 * 분기 시계열 구간. 2023년은 20종목 중 7~8곳이 분기보고서를 내지 않아(11012/11013 `013`)
 * 시계열이 성기다 — 2024Q1부터 잡으면 대부분의 종목에서 연속 9분기가 확보된다.
 * 상한 2026Q1은 실측 상한이다(2026 반기보고서 법정기한 8/14 이전이라 11012가 전 종목 `013`).
 */
export const QUARTER_RANGE = {
  from: { year: "2024", quarter: 1 as const },
  to: { year: "2026", quarter: 1 as const },
};

/** 연간 성장률(YoY) 자체 계산 대상 — DART 산출지표(M231000 등)와 나란히 놓고 교차검증한다. */
const ANNUAL_GROWTH_KEYS = ["revenue", "operating_income", "net_income_attributable_to_owners"] as const;

export interface QuarterSeries {
  metricKey: string;
  points: (QuarterPoint & { qoq: Resolution; yoy: Resolution })[];
}

function buildQuarterSeriesWithGrowth(dir: string, stock: StockRef, fsDiv: FsDiv, fsDivFallbackApplied: boolean): QuarterSeries[] {
  const load = (year: string, reprtCode: string, fs: FsDiv) =>
    loadSnapshot<AcntAllBody>(dir, `fnlttSinglAcntAll__${stock.corpCode}__${year}__${reprtCode}__${fs}`)?.body ?? null;

  const allCandidates = [...ACNT_ALL_CANDIDATES, ...ACNT_ALL_7SETS_CANDIDATES];
  return QUARTER_SERIES_KEYS.map((key) => {
    const candidate = allCandidates.find((c) => c.key === key)!;
    const points = buildQuarterSeries(candidate, QUARTER_RANGE, load, fsDiv, fsDivFallbackApplied);
    return {
      metricKey: key,
      points: points.map((p, i) => ({
        ...p,
        // QoQ = 직전 분기 대비. 계절성이 있는 업종에선 착시가 크므로 YoY와 항상 함께 본다.
        qoq: deriveGrowth(`${key}_qoq`, p.resolution, points[i - 1]?.resolution ?? missingPoint(key, fsDiv, fsDivFallbackApplied), `${p.label} QoQ`),
        // YoY = 4분기 전(= 작년 같은 분기) 대비. 계절성을 제거한 "진짜 성장".
        yoy: deriveGrowth(`${key}_yoy`, p.resolution, points[i - 4]?.resolution ?? missingPoint(key, fsDiv, fsDivFallbackApplied), `${p.label} YoY`),
      })),
    };
  });
}

function missingPoint(metricKey: string, fsDiv: FsDiv, fsDivFallbackApplied: boolean): Resolution {
  return { metricKey, attempts: [], fsDiv, fsDivFallbackApplied, normalized: null, displayState: "MISSING", parserVersion: PARSER_VERSION };
}

/** 후보 대비 HIT 수 커버리지 — displayState === "OK"(=화면에 그려지는 것)를 HIT으로 집계한다. */
export function resolveStock(dir: string, stock: StockRef): StockDerived {
  const years = YEARS.map((y) => resolveStockYear(dir, stock, y));

  // 연간 YoY 자체 계산 — 직전 연도 Resolution을 그대로 입력으로 쓴다(derived.json 내부 완결).
  years.forEach((y, i) => {
    const prev = years[i - 1];
    for (const key of ANNUAL_GROWTH_KEYS) {
      y.resolutions[`${key}_growth_yoy`] = prev
        ? deriveGrowth(`${key}_growth_yoy`, y.resolutions[key], prev.resolutions[key], `${y.year} YoY(vs ${prev.year})`)
        : missingPoint(`${key}_growth_yoy`, y.fsDiv, y.fsDivFallbackApplied);
    }
  });

  const latest = years[years.length - 1];
  const quarters = buildQuarterSeriesWithGrowth(dir, stock, latest.fsDiv, latest.fsDivFallbackApplied);

  let candidates = 0;
  let hit = 0;
  for (const y of years) {
    for (const r of Object.values(y.resolutions)) {
      candidates++;
      if (r.displayState === "OK") hit++;
    }
  }
  return { stockCode: stock.stockCode, corpCode: stock.corpCode, name: stock.name, years, quarters, coverage: { candidates, hit } };
}
