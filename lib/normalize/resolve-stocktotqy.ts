/**
 * `stockTotqySttus`(주식의 총수 현황) 리졸버.
 * `se === "비고"` 행은 숫자 컬럼에 한글이 들어오므로 반드시 제외한다 (#27).
 * 종목 단위 값은 `se === "합계"` 행을 사용한다(보통주+우선주 합산).
 */

import type { DartEnvelope } from "../dart/client";
import { parseAmount } from "./parse";
import { PARSER_VERSION } from "./types";
import type { MetricCandidate, Resolution } from "./types";

export interface StockTotqyRow {
  se: string;
  isu_stock_totqy?: string;
  now_to_isu_stock_totqy?: string;
  now_to_dcrs_stock_totqy?: string;
  redc?: string;
  profit_incnr?: string;
  rdmstk_repy?: string;
  etc?: string;
  istc_totqy?: string;
  tesstk_co?: string;
  distb_stock_co?: string;
}

export interface StockTotqyBody {
  status: string;
  list?: StockTotqyRow[];
}

export function resolveStockTotqyMetric(
  candidate: MetricCandidate,
  envelope: DartEnvelope<StockTotqyBody> | null,
  fsDiv: "CFS" | "OFS",
  fsDivFallbackApplied: boolean,
): Resolution {
  const field = candidate.stockTotqyField;
  if (!field) throw new Error(`stockTotqyField가 없는 후보입니다: ${candidate.key}`);

  const attempts: Resolution["attempts"] = [];
  const base = { metricKey: candidate.key, fsDiv, fsDivFallbackApplied, parserVersion: PARSER_VERSION };

  const rows = (envelope?.body.status === "000" ? (envelope.body.list ?? []) : []).filter((r) => r.se !== "비고");
  const row = rows.find((r) => r.se === "합계");

  if (!row) {
    attempts.push({ accountId: field, result: "NO_ROW" });
    return { ...base, attempts, normalized: null, displayState: "MISSING" };
  }

  const value = parseAmount(row[field]);
  if (value === null) {
    attempts.push({ accountId: field, result: "EMPTY_VALUE" });
    return { ...base, attempts, normalized: null, displayState: "MISSING" };
  }

  attempts.push({ accountId: field, result: "HIT" });
  return {
    ...base,
    attempts,
    hit: { accountId: field, accountNm: "합계", sjDiv: "", rawValue: row[field] ?? "", ord: 0 },
    normalized: value,
    displayState: "OK",
  };
}
