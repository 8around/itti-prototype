/**
 * T4 — 정규화 엔진 빌드 스크립트.
 *
 * public/snapshots/*.json만 읽어(API 호출 0회) data/derived.json을 생성한다.
 * 실행: pnpm snapshot:build
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PARSER_VERSION } from "../lib/normalize/types";
import { ALL_QUARTER_PERIODS, resolveStock, YEARS } from "../lib/normalize/engine";
import type { StockDerived, StockRef } from "../lib/normalize/engine";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const SNAPSHOTS_DIR = join(PROJECT_ROOT, "public", "snapshots");
const UNIVERSE_PATH = join(PROJECT_ROOT, "data", "universe.json");
const OUTPUT_PATH = join(PROJECT_ROOT, "data", "derived.json");

function loadUniverse(): StockRef[] {
  const rows = JSON.parse(readFileSync(UNIVERSE_PATH, "utf-8")) as StockRef[];
  if (rows.length !== 20) {
    throw new Error(`universe.json 행 수가 20이 아닙니다: ${rows.length}`);
  }
  return rows;
}

/** v2 T2 — 분기(quarters[]) 커버리지. displayState "OK"만 HIT으로 집계(연간 coverage와 동일 기준). */
function quarterCoverage(stock: StockDerived): { candidates: number; hit: number } {
  let candidates = 0;
  let hit = 0;
  for (const q of stock.quarters) {
    for (const r of Object.values(q.resolutions)) {
      candidates++;
      if (r.displayState === "OK") hit++;
    }
  }
  return { candidates, hit };
}

function main(): void {
  const universe = loadUniverse();
  const stocks = universe.map((s) => resolveStock(SNAPSHOTS_DIR, s));

  const output = {
    generatedAt: new Date().toISOString(),
    parserVersion: PARSER_VERSION,
    years: YEARS,
    quarters: ALL_QUARTER_PERIODS,
    stocks,
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf-8");

  console.log("=== T4 정규화 빌드 리포트 (연간) ===\n");
  for (const s of stocks) {
    const pct = ((s.coverage.hit / s.coverage.candidates) * 100).toFixed(1);
    console.log(`${s.name.padEnd(12)} HIT ${String(s.coverage.hit).padStart(3)}/${s.coverage.candidates} (${pct}%)`);
  }

  const totalHit = stocks.reduce((a, s) => a + s.coverage.hit, 0);
  const totalCand = stocks.reduce((a, s) => a + s.coverage.candidates, 0);
  console.log(`\n합계          HIT ${totalHit}/${totalCand} (${((totalHit / totalCand) * 100).toFixed(1)}%)`);

  console.log(`\n=== v2 T2 정규화 빌드 리포트 (분기, ${ALL_QUARTER_PERIODS.length}개 기간×${stocks.length}종목) ===\n`);
  const qCoverages = stocks.map((s) => ({ name: s.name, ...quarterCoverage(s) }));
  for (const c of qCoverages) {
    const pct = ((c.hit / c.candidates) * 100).toFixed(1);
    console.log(`${c.name.padEnd(12)} HIT ${String(c.hit).padStart(4)}/${c.candidates} (${pct}%)`);
  }
  const qTotalHit = qCoverages.reduce((a, c) => a + c.hit, 0);
  const qTotalCand = qCoverages.reduce((a, c) => a + c.candidates, 0);
  console.log(`\n합계          HIT ${qTotalHit}/${qTotalCand} (${((qTotalHit / qTotalCand) * 100).toFixed(1)}%)`);
  console.log("(2026 대부분·연초 분기는 미마감 013이 많아 연간 대비 커버리지가 구조적으로 낮다 — 정상)");

  console.log(`\n${OUTPUT_PATH} 생성 완료`);
}

main();
