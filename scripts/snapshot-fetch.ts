/**
 * T3 — 스냅샷 수집 스크립트.
 *
 * 20종목(universe.json) × 4개 엔드포인트의 DART 원본 응답을 전량 수집해
 * public/snapshots/<requestId>.json에 가공 없이 저장하고, data/manifest.json에
 * 호출별 메타데이터 + 집계(폴백/IS 0행 종목 등)를 남긴다.
 *
 * 실행: pnpm snapshot:fetch [--dry-run] [--force]
 *   --dry-run  호출 없이 계획(엔드포인트별 건수)만 출력
 *   --force    이미 존재하는 스냅샷도 다시 호출(기본은 idempotent — 존재하면 스킵)
 *
 * 수집 매트릭스 (플랜 §5 예산 근거, 연도/reprt_code는 상수 배열 — 나중에 11012/11013
 * 등을 추가해도 아래 루프 코드는 손대지 않는다):
 * - company                — T2가 이미 수집한 원본 20건을 그대로 재사용(호출 0회, source: "t2-reuse")
 * - fnlttSinglAcntAll      — 20종목 × 연도 3 × reprt_code 2 × CFS 시도, 013이면 OFS 폴백 (#37)
 * - fnlttSinglIndx         — 20종목 × 연도 3 × idx_cl_code 4 (콤마 다중지정 불가 → 개별 호출, #42)
 * - alotMatter             — 20종목 × (bsns_year=2025, reprt_code=11011) 1회로 2023~2025 커버
 * - stockTotqySttus        — 20종목 × 연도 3 × reprt_code=11011
 *
 * 함정 대응:
 * - `020`(요청 제한 초과) 감지 시 이 스크립트가 즉시 전체 중단한다. client.ts는 판정만 하고
 *   중단 여부는 호출부 책임으로 설계되어 있다 — 여기서 공유 abort 플래그로 구현.
 * - CFS `013`은 "연결 미작성"과 "데이터 없음"을 구분하지 못하므로 반드시 OFS 재시도 (#37).
 *   CFS의 013 응답도 폴백 증거로 그대로 스냅샷에 남긴다.
 * - IS 0행 집계는 수집 루프와 분리된 후처리로, 저장된 스냅샷을 다시 읽어 계산한다(#32).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { callDartEndpoint, type DartEnvelope } from "../lib/dart/client";
import { validateEndpointParams, type DartEndpoint } from "../lib/dart/endpoints";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const DATA_DIR = join(PROJECT_ROOT, "data");
const COMPANY_DIR = join(DATA_DIR, "company");
const SNAPSHOTS_DIR = join(PROJECT_ROOT, "public", "snapshots");
const MANIFEST_PATH = join(DATA_DIR, "manifest.json");
const UNIVERSE_PATH = join(DATA_DIR, "universe.json");

const CONCURRENCY = 4;
const REQUEST_GAP_MS = 150;

// ---------------------------------------------------------------------------
// .env.local 로드 (Next.js 밖 단독 스크립트라 자동 로드가 안 되어 직접 파싱 — resolve-corp-codes.ts와 동일 패턴)
// ---------------------------------------------------------------------------
function loadEnvLocal(): void {
  const envPath = join(PROJECT_ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");

// ---------------------------------------------------------------------------
// 수집 매트릭스 상수 — 배열이 곧 계획. 원소를 추가/제거하면 루프 수정 없이 계획이 바뀐다.
// ---------------------------------------------------------------------------
const YEARS = ["2023", "2024", "2025"] as const;
const ACNT_ALL_REPRT_CODES = ["11011", "11014"] as const;
const INDX_REPRT_CODES = ["11011"] as const;
const INDX_CATEGORIES = ["M210000", "M220000", "M230000", "M240000"] as const;
const ALOT_MATTER_YEARS = ["2025"] as const; // 1회로 2023~2025 3개년 커버
const ALOT_MATTER_REPRT_CODES = ["11011"] as const;
const STOCKTOTQY_REPRT_CODES = ["11011"] as const;

interface UniverseRow {
  stockCode: string;
  corpCode: string;
  name: string;
  market: string;
  indutyCode: string;
  ksic2: string;
  accMt: string;
  profile: string;
  profileSource: "KSIC_AUTO" | "MANUAL";
  note: string;
}

function loadUniverse(): UniverseRow[] {
  const rows = JSON.parse(readFileSync(UNIVERSE_PATH, "utf-8")) as UniverseRow[];
  if (rows.length !== 20) {
    throw new Error(`universe.json 행 수가 20이 아닙니다: ${rows.length}`);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Job / manifest 호출 로그 타입
// ---------------------------------------------------------------------------
interface Job {
  requestId: string;
  endpoint: DartEndpoint;
  corpCode: string;
  stockCode: string;
  name: string;
  params: Record<string, string>;
}

type CallSource = "live" | "cache" | "t2-reuse";

interface CallLogEntry {
  requestId: string;
  endpoint: DartEndpoint;
  corpCode: string;
  stockCode: string;
  name: string;
  params: Record<string, string>;
  status: string;
  message: string;
  bytes: number;
  elapsedMs: number;
  fetchedAt: string;
  source: CallSource;
  /** CFS→OFS 폴백 시퀀스에 속한 호출이면 true (CFS 013 호출·뒤이은 OFS 호출 둘 다) */
  fsDivFallback: boolean;
}

/**
 * requestId 규칙: `<endpoint>__<corpCode>__<이하 파라미터를 endpoints.ts 필수 파라미터 순서대로 __ 연결>`
 * 예: fnlttSinglAcntAll__00126380__2024__11011__CFS
 */
function makeJob(endpoint: DartEndpoint, stock: UniverseRow, extra: Record<string, string>, order: string[]): Job {
  const params = { corp_code: stock.corpCode, ...extra };
  const requestId = [endpoint, stock.corpCode, ...order.map((key) => extra[key])].join("__");
  return { requestId, endpoint, corpCode: stock.corpCode, stockCode: stock.stockCode, name: stock.name, params };
}

// ---------------------------------------------------------------------------
// company — T2 산출물 재사용 (호출 0회)
// ---------------------------------------------------------------------------
function buildCompanyEntries(universe: UniverseRow[]): CallLogEntry[] {
  const entries: CallLogEntry[] = [];
  for (const stock of universe) {
    const requestId = `company__${stock.corpCode}`;
    const srcPath = join(COMPANY_DIR, `${stock.stockCode}.json`);
    const destPath = join(SNAPSHOTS_DIR, `${requestId}.json`);

    if (!existsSync(srcPath)) {
      throw new Error(`company 원본이 없습니다 (T2 산출물 확인 필요): ${srcPath}`);
    }
    const raw = readFileSync(srcPath, "utf-8");
    const envelope = JSON.parse(raw) as DartEnvelope;

    if (!DRY_RUN && (!existsSync(destPath) || FORCE)) {
      mkdirSync(SNAPSHOTS_DIR, { recursive: true });
      writeFileSync(destPath, raw.endsWith("\n") ? raw : `${raw}\n`, "utf-8");
    }

    entries.push({
      requestId,
      endpoint: "company",
      corpCode: stock.corpCode,
      stockCode: stock.stockCode,
      name: stock.name,
      params: { corp_code: stock.corpCode },
      status: envelope.status,
      message: envelope.message,
      bytes: envelope.bytes,
      elapsedMs: envelope.elapsedMs,
      fetchedAt: envelope.fetchedAt,
      source: "t2-reuse",
      fsDivFallback: false,
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// 실 호출 대상 4종 — 수집 매트릭스 상수 배열을 그대로 순회해서 계획을 만든다.
// ---------------------------------------------------------------------------
function buildBaseJobs(universe: UniverseRow[]): Job[] {
  const jobs: Job[] = [];
  for (const stock of universe) {
    for (const year of YEARS) {
      for (const reprt of ACNT_ALL_REPRT_CODES) {
        jobs.push(
          makeJob("fnlttSinglAcntAll", stock, { bsns_year: year, reprt_code: reprt, fs_div: "CFS" }, [
            "bsns_year",
            "reprt_code",
            "fs_div",
          ]),
        );
      }
    }
    for (const year of YEARS) {
      for (const reprt of INDX_REPRT_CODES) {
        for (const idx of INDX_CATEGORIES) {
          jobs.push(
            makeJob("fnlttSinglIndx", stock, { bsns_year: year, reprt_code: reprt, idx_cl_code: idx }, [
              "bsns_year",
              "reprt_code",
              "idx_cl_code",
            ]),
          );
        }
      }
    }
    for (const year of ALOT_MATTER_YEARS) {
      for (const reprt of ALOT_MATTER_REPRT_CODES) {
        jobs.push(makeJob("alotMatter", stock, { bsns_year: year, reprt_code: reprt }, ["bsns_year", "reprt_code"]));
      }
    }
    for (const year of YEARS) {
      for (const reprt of STOCKTOTQY_REPRT_CODES) {
        jobs.push(
          makeJob("stockTotqySttus", stock, { bsns_year: year, reprt_code: reprt }, ["bsns_year", "reprt_code"]),
        );
      }
    }
  }
  return jobs;
}

/** CFS 013 응답에 대해서만 같은 파라미터로 OFS 재시도 job을 만든다 (#37). */
function buildFallbackJobs(universe: UniverseRow[], baseResults: CallLogEntry[]): Job[] {
  const byCorp = new Map(universe.map((s) => [s.corpCode, s]));
  const jobs: Job[] = [];
  for (const r of baseResults) {
    if (r.endpoint === "fnlttSinglAcntAll" && r.params.fs_div === "CFS" && r.status === "013") {
      const stock = byCorp.get(r.corpCode);
      if (!stock) continue;
      jobs.push(
        makeJob(
          "fnlttSinglAcntAll",
          stock,
          { bsns_year: r.params.bsns_year, reprt_code: r.params.reprt_code, fs_div: "OFS" },
          ["bsns_year", "reprt_code", "fs_div"],
        ),
      );
    }
  }
  return jobs;
}

// ---------------------------------------------------------------------------
// 실행 — 동시성 4, 요청 간 150ms(라이브 호출에만 적용), 020 감지 시 즉시 전체 중단
// ---------------------------------------------------------------------------
let aborted = false;
let abortReason: string | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toEntry(job: Job, envelope: DartEnvelope, source: CallSource): CallLogEntry {
  return {
    requestId: job.requestId,
    endpoint: job.endpoint,
    corpCode: job.corpCode,
    stockCode: job.stockCode,
    name: job.name,
    params: job.params,
    status: envelope.status,
    message: envelope.message,
    bytes: envelope.bytes,
    elapsedMs: envelope.elapsedMs,
    fetchedAt: envelope.fetchedAt,
    source,
    fsDivFallback: false, // 후처리(markFsDivFallback)에서 채운다
  };
}

async function executeJob(job: Job): Promise<CallLogEntry> {
  const filePath = join(SNAPSHOTS_DIR, `${job.requestId}.json`);

  // idempotent: 이미 있으면 재호출하지 않고 기존 스냅샷을 읽어 manifest에만 반영한다.
  if (existsSync(filePath) && !FORCE) {
    const cached = JSON.parse(readFileSync(filePath, "utf-8")) as DartEnvelope;
    return toEntry(job, cached, "cache");
  }

  const validation = validateEndpointParams(job.endpoint, job.params);
  if (!validation.ok) {
    throw new Error(`파라미터 검증 실패 requestId=${job.requestId}: ${validation.error}`);
  }

  const envelope = await callDartEndpoint(job.endpoint, validation.params);
  mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(envelope, null, 2)}\n`, "utf-8");
  return toEntry(job, envelope, "live");
}

async function runJobs(jobs: Job[]): Promise<CallLogEntry[]> {
  const results: CallLogEntry[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (!aborted && cursor < jobs.length) {
      const job = jobs[cursor++];
      const entry = await executeJob(job);
      results.push(entry);

      if (entry.status === "020") {
        aborted = true;
        abortReason = `020(요청 제한 초과) 감지 — requestId=${entry.requestId}. 전체 수집 즉시 중단.`;
        console.error(`\n[중단] ${abortReason}`);
        return;
      }

      // 캐시 히트는 실제 DART 호출이 아니므로 페이싱 대상이 아니다.
      if (entry.source === "live") {
        await sleep(REQUEST_GAP_MS);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return results;
}

/** CFS 013 → OFS 재시도가 일어난 (corp, year, reprt) 조합에 속한 호출을 전부 표시한다. */
function markFsDivFallback(acntAllEntries: CallLogEntry[]): void {
  const fallbackKeys = new Set<string>();
  for (const e of acntAllEntries) {
    if (e.params.fs_div === "CFS" && e.status === "013") {
      fallbackKeys.add(`${e.corpCode}|${e.params.bsns_year}|${e.params.reprt_code}`);
    }
  }
  for (const e of acntAllEntries) {
    const key = `${e.corpCode}|${e.params.bsns_year}|${e.params.reprt_code}`;
    if (fallbackKeys.has(key)) e.fsDivFallback = true;
  }
}

function computeFallbackStocks(universe: UniverseRow[], acntAllEntries: CallLogEntry[]): UniverseRow[] {
  const corps = new Set(acntAllEntries.filter((e) => e.fsDivFallback).map((e) => e.corpCode));
  return universe.filter((s) => corps.has(s.corpCode));
}

interface AcntAllRow {
  sj_div?: string;
}
interface AcntAllBody {
  status: string;
  message: string;
  list?: AcntAllRow[];
}

/**
 * IS 0행 집계 — 수집 루프와 분리된 후처리. 저장된 스냅샷을 다시 읽어
 * sj_div === "IS" 행 수를 센다(#32). CFS/OFS 폴백이 있었던 (year, reprt)는
 * 최종적으로 유효했던 응답(OFS 우선)만 집계 대상으로 삼는다.
 */
function computeIsZeroRowStocks(universe: UniverseRow[], acntAllEntries: CallLogEntry[]): UniverseRow[] {
  const flagged: UniverseRow[] = [];

  for (const stock of universe) {
    const stockEntries = acntAllEntries.filter((e) => e.corpCode === stock.corpCode);
    const winners = new Map<string, CallLogEntry>();
    for (const e of stockEntries) {
      const key = `${e.params.bsns_year}|${e.params.reprt_code}`;
      const existing = winners.get(key);
      if (!existing || e.params.fs_div === "OFS") {
        winners.set(key, e);
      }
    }

    let successCount = 0;
    let isRowTotal = 0;
    for (const entry of winners.values()) {
      if (entry.status !== "000") continue;
      successCount++;
      const filePath = join(SNAPSHOTS_DIR, `${entry.requestId}.json`);
      const envelope = JSON.parse(readFileSync(filePath, "utf-8")) as DartEnvelope<AcntAllBody>;
      const rows = envelope.body.list ?? [];
      isRowTotal += rows.filter((r) => r.sj_div === "IS").length;
    }

    if (successCount > 0 && isRowTotal === 0) {
      flagged.push(stock);
    }
  }

  return flagged;
}

// ---------------------------------------------------------------------------
// 출력
// ---------------------------------------------------------------------------
function printDryRunPlan(companyEntries: CallLogEntry[], baseJobs: Job[]): void {
  const counts = new Map<DartEndpoint, number>();
  for (const j of baseJobs) counts.set(j.endpoint, (counts.get(j.endpoint) ?? 0) + 1);

  console.log("=== T3 스냅샷 수집 계획 (--dry-run, 호출 0회) ===\n");
  console.log(`${"company (T2 재사용, 실 API 호출 0회)".padEnd(38)}${companyEntries.length.toString().padStart(4)}건`);
  for (const endpoint of ["fnlttSinglAcntAll", "fnlttSinglIndx", "alotMatter", "stockTotqySttus"] as const) {
    console.log(`${endpoint.padEnd(38)}${(counts.get(endpoint) ?? 0).toString().padStart(4)}건`);
  }

  const liveTotal = baseJobs.length;
  console.log(`\n실 API 호출 계획 합계(CFS→OFS 폴백 제외)   ${liveTotal}건`);
  console.log(`스냅샷 파일 합계(company 포함, 폴백 제외)   ${liveTotal + companyEntries.length}건`);

  const expectedSec = (Math.ceil(liveTotal / CONCURRENCY) * REQUEST_GAP_MS) / 1000;
  console.log(`동시성 ${CONCURRENCY} · 요청 간 ${REQUEST_GAP_MS}ms · 예상 소요 약 ${expectedSec.toFixed(1)}초 (폴백 제외)`);
  console.log("\nCFS 013(연결 미작성/데이터없음) 발생 시 종목별 OFS 재시도가 추가된다 — 실제 폴백 건수는 실행 후 확정.");
}

function printReport(
  entries: CallLogEntry[],
  opts: {
    elapsedMs: number;
    fallbackStocks: UniverseRow[];
    isZeroRowStocks: UniverseRow[];
    aborted: boolean;
    abortReason: string | null;
  },
): void {
  const statusDist = new Map<string, number>();
  let totalBytes = 0;
  for (const e of entries) {
    statusDist.set(e.status, (statusDist.get(e.status) ?? 0) + 1);
    totalBytes += e.bytes;
  }
  const n000 = statusDist.get("000") ?? 0;
  const n013 = statusDist.get("013") ?? 0;
  const nOther = entries.length - n000 - n013;

  const liveCount = entries.filter((e) => e.source === "live").length;
  const cacheCount = entries.filter((e) => e.source === "cache").length;
  const reuseCount = entries.filter((e) => e.source === "t2-reuse").length;

  console.log("\n=== T3 스냅샷 수집 리포트 ===");
  if (opts.aborted) {
    console.log(`⚠️  중단됨: ${opts.abortReason}`);
  }
  console.log(
    `총 호출        ${entries.length}회 (실 API ${liveCount} / 캐시 재사용 ${cacheCount} / company T2재사용 ${reuseCount}) / 성공(000) ${n000} / 013 ${n013} / 기타 ${nOther}`,
  );
  console.log(
    `CFS→OFS 폴백  ${opts.fallbackStocks.length}개 종목: ${opts.fallbackStocks.map((s) => s.name).join(", ") || "없음"}`,
  );
  console.log(
    `IS 0행 종목    ${opts.isZeroRowStocks.length}개: ${opts.isZeroRowStocks.map((s) => s.name).join(", ") || "없음"}`,
  );
  console.log(`소요           약 ${(opts.elapsedMs / 1000).toFixed(1)}초 / ${(totalBytes / 1024 / 1024).toFixed(1)}MB`);

  if (nOther > 0) {
    console.log("\n기타 status 분포 (000/013 제외):");
    for (const [status, count] of statusDist) {
      if (status === "000" || status === "013") continue;
      console.log(`  ${status}: ${count}건`);
    }
  }
}

function writeManifest(
  entries: CallLogEntry[],
  opts: {
    fallbackStocks: UniverseRow[];
    isZeroRowStocks: UniverseRow[];
    elapsedMs: number;
    aborted: boolean;
    abortReason: string | null;
  },
): void {
  const statusDistribution: Record<string, number> = {};
  let totalBytes = 0;
  for (const e of entries) {
    statusDistribution[e.status] = (statusDistribution[e.status] ?? 0) + 1;
    totalBytes += e.bytes;
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    calls: entries,
    summary: {
      totalEntries: entries.length,
      liveApiCalls: entries.filter((e) => e.source === "live").length,
      cachedSkips: entries.filter((e) => e.source === "cache").length,
      companyReused: entries.filter((e) => e.source === "t2-reuse").length,
      statusDistribution,
      fsDivFallbackStocks: opts.fallbackStocks.map((s) => ({
        stockCode: s.stockCode,
        corpCode: s.corpCode,
        name: s.name,
      })),
      isZeroRowStocks: opts.isZeroRowStocks.map((s) => ({
        stockCode: s.stockCode,
        corpCode: s.corpCode,
        name: s.name,
      })),
      totalBytes,
      elapsedMs: opts.elapsedMs,
      aborted: opts.aborted,
      abortReason: opts.abortReason,
    },
  };

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}

// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  if (!DRY_RUN && !process.env.DART_API_KEY) {
    throw new Error("DART_API_KEY가 없습니다 (.env.local 확인).");
  }

  const universe = loadUniverse();
  const companyEntries = buildCompanyEntries(universe);
  const baseJobs = buildBaseJobs(universe);

  if (DRY_RUN) {
    printDryRunPlan(companyEntries, baseJobs);
    return;
  }

  console.log(`=== T3 스냅샷 수집 시작 (동시성 ${CONCURRENCY} · 요청 간 ${REQUEST_GAP_MS}ms) ===`);
  console.log(`계획: company 재사용 ${companyEntries.length}건 + 실 API 호출 최대 ${baseJobs.length}건(+CFS→OFS 폴백)`);

  const t0 = Date.now();
  const baseResults = await runJobs(baseJobs);

  let fallbackResults: CallLogEntry[] = [];
  if (!aborted) {
    const fallbackJobs = buildFallbackJobs(universe, baseResults);
    if (fallbackJobs.length > 0) {
      console.log(`\nCFS 013 감지 ${fallbackJobs.length}건 → OFS 폴백 재시도 시작`);
      fallbackResults = await runJobs(fallbackJobs);
    }
  }
  const elapsedMs = Date.now() - t0;

  const acntAllEntries = [...baseResults, ...fallbackResults].filter((e) => e.endpoint === "fnlttSinglAcntAll");
  markFsDivFallback(acntAllEntries);

  const fallbackStocks = computeFallbackStocks(universe, acntAllEntries);
  const isZeroRowStocks = computeIsZeroRowStocks(universe, acntAllEntries);

  const allEntries = [...companyEntries, ...baseResults, ...fallbackResults];

  writeManifest(allEntries, { fallbackStocks, isZeroRowStocks, elapsedMs, aborted, abortReason });
  printReport(allEntries, { elapsedMs, fallbackStocks, isZeroRowStocks, aborted, abortReason });

  if (aborted) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
