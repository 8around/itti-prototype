/**
 * 종목×연도 단위 정규화 오케스트레이터. `public/snapshots/*.json`만 읽는다(API 호출 0회).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { DartEnvelope } from "../dart/client";
import { ACNT_ALL_CANDIDATES, ALOT_MATTER_CANDIDATES, Q4_DERIVABLE_KEYS, SINGL_INDX_CANDIDATES, STOCK_TOTQY_CANDIDATES } from "./catalog";
import { deriveFcf, deriveOperatingMargin, deriveQ4, deriveRoa } from "./derive";
import type { AcntAllBody, FsDiv } from "./resolve";
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
  for (const c of ACNT_ALL_CANDIDATES) {
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
  return { stockCode: stock.stockCode, corpCode: stock.corpCode, name: stock.name, years, coverage: { candidates, hit } };
}
