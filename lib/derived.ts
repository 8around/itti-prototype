/**
 * `data/derived.json`(T4 산출물) 로더 — 여러 화면(T7 compare/pnl, T10 종목 상세)이 공유하는
 * 최소 유틸. derived.json 자체는 절대 여기서도 수정하지 않는다(읽기 전용).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { FsDiv } from "./normalize/resolve";
import type { Resolution } from "./normalize/types";

export interface DerivedYearResolutions {
  year: string;
  fsDiv: FsDiv;
  fsDivFallbackApplied: boolean;
  resolutions: Record<string, Resolution>;
}

export interface DerivedStock {
  stockCode: string;
  corpCode: string;
  name: string;
  years: DerivedYearResolutions[];
  coverage: { candidates: number; hit: number };
}

export interface DerivedFile {
  generatedAt: string;
  parserVersion: string;
  years: string[];
  stocks: DerivedStock[];
}

export function loadDerived(): DerivedFile {
  const raw = readFileSync(join(process.cwd(), "data", "derived.json"), "utf-8");
  return JSON.parse(raw) as DerivedFile;
}

export function findStockByCode(derived: DerivedFile, stockCode: string): DerivedStock {
  const stock = derived.stocks.find((s) => s.stockCode === stockCode);
  if (!stock) throw new Error(`derived.json에 종목이 없습니다: ${stockCode}`);
  return stock;
}

export function findYear(stock: DerivedStock, year: string): DerivedYearResolutions {
  const y = stock.years.find((yy) => yy.year === year);
  if (!y) throw new Error(`derived.json에 연도가 없습니다: ${stock.name} ${year}`);
  return y;
}
