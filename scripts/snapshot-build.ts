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
import { resolveStock, YEARS } from "../lib/normalize/engine";
import type { StockRef } from "../lib/normalize/engine";

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

function main(): void {
  const universe = loadUniverse();
  const stocks = universe.map((s) => resolveStock(SNAPSHOTS_DIR, s));

  const output = {
    generatedAt: new Date().toISOString(),
    parserVersion: PARSER_VERSION,
    years: YEARS,
    stocks,
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf-8");

  console.log("=== T4 정규화 빌드 리포트 ===\n");
  for (const s of stocks) {
    const pct = ((s.coverage.hit / s.coverage.candidates) * 100).toFixed(1);
    console.log(`${s.name.padEnd(12)} HIT ${String(s.coverage.hit).padStart(3)}/${s.coverage.candidates} (${pct}%)`);
  }

  const totalHit = stocks.reduce((a, s) => a + s.coverage.hit, 0);
  const totalCand = stocks.reduce((a, s) => a + s.coverage.candidates, 0);
  console.log(`\n합계          HIT ${totalHit}/${totalCand} (${((totalHit / totalCand) * 100).toFixed(1)}%)`);
  console.log(`\n${OUTPUT_PATH} 생성 완료`);
}

main();
