/**
 * T2 — 20종목 유니버스 확정 스크립트.
 *
 * corpCode.xml(ZIP)을 1회 다운로드해 20종목의 stock_code → corp_code를 해석하고,
 * company.json(T1 클라이언트) 20회 호출로 induty_code/acc_mt/corp_cls를 수집한 뒤
 * data/universe.json(20행)과 data/company/{stockCode}.json(원본 20개)을 만든다.
 *
 * 실행: pnpm resolve-corp-codes  (= pnpm tsx scripts/resolve-corp-codes.ts)
 *
 * 함정 대응 (ete-django/docs/dart-api/ds001-disclosure.md §1, §2 근거):
 * - corpCode.xml 에러 시 ZIP이 아니라 XML이 온다 → 매직바이트 PK\x03\x04로 분기 (#없음, README §"예외적 응답 형식")
 * - 비상장 stock_code는 공백 1개 → .trim() 후 판정 (#14)
 * - 동명이인(우리금융지주 2건 등) → stock_code로 매칭 + modify_date 최신 우선
 * - induty_code 자릿수 가변 → zero-fill 금지, KSIC 중분류(앞 2자리)만 안전 (#16)
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { callDartEndpoint, DartClientError, type DartEnvelope } from "../lib/dart/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const DATA_DIR = join(PROJECT_ROOT, "data");
const COMPANY_DIR = join(DATA_DIR, "company");
const CORP_CODE_ENDPOINT = "https://opendart.fss.or.kr/api/corpCode.xml";

// ---------------------------------------------------------------------------
// .env.local 로드 (Next.js 밖 단독 스크립트라 자동 로드가 안 되어 직접 파싱)
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

const API_KEY = process.env.DART_API_KEY;
if (!API_KEY) {
  throw new Error("DART_API_KEY가 없습니다 (.env.local 확인).");
}

// ---------------------------------------------------------------------------
// corpCode.xml 다운로드 + ZIP 해제 (시스템 unzip 사용 — 근거는 보고서 참조)
// ---------------------------------------------------------------------------
async function downloadCorpCodeXml(): Promise<string> {
  const url = `${CORP_CODE_ENDPOINT}?crtfc_key=${API_KEY}`;
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());

  const isZip = buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  if (!isZip) {
    const text = buf.toString("utf-8");
    throw new Error(`corpCode.xml이 ZIP이 아닙니다 (에러 응답으로 추정). 응답 본문 앞부분: ${text.slice(0, 300)}`);
  }
  console.log(`[corpCode] ZIP 다운로드 완료: ${buf.length.toLocaleString()} bytes`);

  const workDir = mkdtempSync(join(tmpdir(), "dart-corpcode-"));
  const zipPath = join(workDir, "corpCode.zip");
  writeFileSync(zipPath, buf);
  execFileSync("unzip", ["-o", zipPath, "-d", workDir], { stdio: "pipe" });

  const xmlPath = join(workDir, "CORPCODE.xml");
  if (!existsSync(xmlPath)) {
    throw new Error(`압축 해제 후 CORPCODE.xml을 찾을 수 없습니다: ${workDir}`);
  }
  const xml = readFileSync(xmlPath, "utf-8");
  console.log(`[corpCode] XML 해제 완료: ${xml.length.toLocaleString()} chars (${workDir})`);

  rmSync(workDir, { recursive: true, force: true });
  return xml;
}

// ---------------------------------------------------------------------------
// XML 파싱 (118,692 레코드 규모 — 정규식 파싱으로 충분, 스트리밍 불필요)
// ---------------------------------------------------------------------------
interface CorpCodeRecord {
  corpCode: string;
  corpName: string;
  stockCode: string; // trim 적용됨. 비상장은 ""
  modifyDate: string; // YYYYMMDD
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractTag(block: string, tag: string): string {
  const match = new RegExp(`<${tag}>([^<]*)<\\/${tag}>`).exec(block);
  return match ? decodeXmlEntities(match[1]) : "";
}

function parseCorpCodeXml(xml: string): CorpCodeRecord[] {
  const records: CorpCodeRecord[] = [];
  const listRe = /<list>([\s\S]*?)<\/list>/g;
  let m: RegExpExecArray | null;
  while ((m = listRe.exec(xml))) {
    const block = m[1];
    records.push({
      corpCode: extractTag(block, "corp_code"),
      corpName: extractTag(block, "corp_name"),
      stockCode: extractTag(block, "stock_code").trim(), // #14: 비상장은 공백 1개
      modifyDate: extractTag(block, "modify_date"),
    });
  }
  return records;
}

/** 상장 레코드만 남기고 stock_code로 dedupe (동명이인 대응 — modify_date 최신 우선, #없음) */
function dedupeListedByStockCode(records: CorpCodeRecord[]): Map<string, CorpCodeRecord> {
  const byStock = new Map<string, CorpCodeRecord>();
  for (const r of records) {
    if (r.stockCode === "") continue;
    const existing = byStock.get(r.stockCode);
    if (!existing || r.modifyDate > existing.modifyDate) {
      byStock.set(r.stockCode, r);
    }
  }
  return byStock;
}

// ---------------------------------------------------------------------------
// 19종목 확정 목록 (플랜 §3 표 = 정본). corpCodeHint는 표에 명시된 값 — 교차검증용.
// ---------------------------------------------------------------------------
interface StockSpec {
  stockCode: string;
  name: string;
  note: string;
  corpCodeHint?: string;
}

const KNOWN_19: StockSpec[] = [
  { stockCode: "005930", name: "삼성전자", note: "기준선. 4Q 역산 검산값 확보", corpCodeHint: "00126380" },
  { stockCode: "000660", name: "SK하이닉스", note: "계정명 편차" },
  { stockCode: "005380", name: "현대차", note: "계정명 편차" },
  { stockCode: "005490", name: "POSCO홀딩스", note: "계정명 편차" },
  { stockCode: "051910", name: "LG화학", note: "계정명 편차" },
  { stockCode: "035720", name: "카카오", note: "IS 0행(CIS만), 순손실인데 배당", corpCodeHint: "00258801" },
  { stockCode: "035420", name: "NAVER", note: "비교군" },
  { stockCode: "068270", name: "셀트리온", note: 'stock_knd 전 행 "-"인데 실제 배당', corpCodeHint: "00413046" },
  {
    stockCode: "084990",
    name: "헬릭스미스",
    note: "EPS 행 없음 → 폴백 체인, 적자, 무배당",
    corpCodeHint: "00359395",
  },
  { stockCode: "215600", name: "신라젠", note: "적자 (ROE −28.05)", corpCodeHint: "00919966" },
  { stockCode: "034020", name: "두산에너빌리티", note: "EPS 값이 빈 문자열", corpCodeHint: "00159616" },
  { stockCode: "329180", name: "HD현대중공업", note: "희석 EPS 행 없음", corpCodeHint: "01390344" },
  { stockCode: "174900", name: "앱클론", note: "CFS 013 → OFS 폴백", corpCodeHint: "00991191" },
  { stockCode: "105560", name: "KB금융", note: "ifrs-full_Revenue 행 없음, 지표 66→34", corpCodeHint: "00688996" },
  { stockCode: "055550", name: "신한지주", note: "지주 간 표기 차이" },
  { stockCode: "016360", name: "삼성증권", note: "★ 양준호 지적" },
  { stockCode: "005940", name: "NH투자증권", note: "★ 동일 비즈니스, 다른 표기" },
  { stockCode: "032830", name: "삼성생명", note: "보험손익 계정" },
  { stockCode: "005830", name: "DB손해보험", note: "생보 vs 손보 차이" },
];

/** 금융 세분류 수동 확정 (플랜 §3 "프로필" 컬럼 그대로) */
const MANUAL_FIN_PROFILE: Record<string, "FIN_BANK" | "FIN_SECURITIES" | "FIN_INSURANCE" | "FIN_HOLDING"> = {
  "105560": "FIN_HOLDING", // KB금융
  "055550": "FIN_HOLDING", // 신한지주
  "016360": "FIN_SECURITIES", // 삼성증권
  "005940": "FIN_SECURITIES", // NH투자증권
  "032830": "FIN_INSURANCE", // 삼성생명
  "005830": "FIN_INSURANCE", // DB손해보험
  "001720": "FIN_SECURITIES", // 신영증권 (20번째 종목 — 결산월 3월, ksic2=66 증권업)
};

/** 20번째(결산월 ≠ 12) 후보 — 이름 부분일치로 corpCode.xml에서 검색, company.json으로 acc_mt 실측 검증 */
const CANDIDATE_20TH_NAMES = ["신영증권", "신영와코루", "대한제당", "동화약품", "유수홀딩스"];

// ---------------------------------------------------------------------------
// company.json (T1 클라이언트 callDartEndpoint 사용)
// ---------------------------------------------------------------------------
interface CompanyBody {
  status: string;
  message: string;
  corp_code: string;
  corp_name: string;
  corp_name_eng: string;
  stock_name: string;
  stock_code: string;
  ceo_nm: string;
  corp_cls: string;
  jurir_no: string;
  bizr_no: string;
  adres: string;
  hm_url: string;
  ir_url: string;
  phn_no: string;
  fax_no: string;
  induty_code: string;
  est_dt: string;
  acc_mt: string;
}

async function fetchCompany(corpCode: string): Promise<DartEnvelope<CompanyBody>> {
  const envelope = await callDartEndpoint<CompanyBody>("company", { corp_code: corpCode });
  if (envelope.status !== "000") {
    throw new Error(`company.json 실패 corp_code=${corpCode} status=${envelope.status} message=${envelope.message}`);
  }
  return envelope;
}

// ---------------------------------------------------------------------------
// 손익구조(profile) 판정
// ---------------------------------------------------------------------------
type ProfileResult = {
  ksic2: string;
  profile: "NON_FIN" | "FIN_BANK" | "FIN_SECURITIES" | "FIN_INSURANCE" | "FIN_HOLDING";
  profileSource: "KSIC_AUTO" | "MANUAL";
};

const FINANCIAL_KSIC2 = new Set(["64", "65", "66"]);

function classifyProfile(stockCode: string, indutyCode: string): ProfileResult {
  const ksic2 = indutyCode.slice(0, 2); // zero-fill 금지 (#16)
  if (!FINANCIAL_KSIC2.has(ksic2)) {
    return { ksic2, profile: "NON_FIN", profileSource: "KSIC_AUTO" };
  }
  const manual = MANUAL_FIN_PROFILE[stockCode];
  if (!manual) {
    throw new Error(
      `KSIC 자동판정=금융(ksic2=${ksic2})이지만 stockCode=${stockCode}의 수동 프로필 매핑이 없습니다. ` +
        `MANUAL_FIN_PROFILE에 추가하세요.`,
    );
  }
  return { ksic2, profile: manual, profileSource: "MANUAL" };
}

// ---------------------------------------------------------------------------
// universe.json 행 타입
// ---------------------------------------------------------------------------
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

async function buildRow(spec: StockSpec, corpRecord: CorpCodeRecord): Promise<{ row: UniverseRow; envelope: DartEnvelope<CompanyBody> }> {
  if (spec.corpCodeHint && spec.corpCodeHint !== corpRecord.corpCode) {
    console.warn(
      `[경고] ${spec.name}(${spec.stockCode}): 플랜 표의 corp_code 힌트(${spec.corpCodeHint})와 ` +
        `corpCode.xml 해석 결과(${corpRecord.corpCode})가 다릅니다. corpCode.xml 실측값을 채택합니다.`,
    );
  }

  const envelope = await fetchCompany(corpRecord.corpCode);
  const body = envelope.body;
  const { ksic2, profile, profileSource } = classifyProfile(spec.stockCode, body.induty_code);

  const row: UniverseRow = {
    stockCode: spec.stockCode,
    corpCode: corpRecord.corpCode,
    name: body.stock_name || spec.name,
    market: body.corp_cls,
    indutyCode: body.induty_code,
    ksic2,
    accMt: body.acc_mt,
    profile,
    profileSource,
    note: spec.note,
  };
  return { row, envelope };
}

async function main() {
  console.log("=== T2 — corpCode.xml 다운로드 ===");
  const xml = await downloadCorpCodeXml();

  console.log("=== corpCode.xml 파싱 ===");
  const allRecords = parseCorpCodeXml(xml);
  console.log(`[corpCode] 전체 레코드: ${allRecords.length.toLocaleString()}`);
  const byStock = dedupeListedByStockCode(allRecords);
  console.log(`[corpCode] 상장(stock_code 존재) dedupe 후: ${byStock.size.toLocaleString()}`);

  // --- 19종목 corp_code 해석 ---
  console.log("\n=== 19종목 corp_code 해석 ===");
  const resolved19: { spec: StockSpec; corpRecord: CorpCodeRecord }[] = [];
  for (const spec of KNOWN_19) {
    const corpRecord = byStock.get(spec.stockCode);
    if (!corpRecord) {
      throw new Error(`corpCode.xml에서 stockCode=${spec.stockCode}(${spec.name})를 찾을 수 없습니다.`);
    }
    console.log(`  ${spec.name}(${spec.stockCode}) → corp_code=${corpRecord.corpCode} (modify_date=${corpRecord.modifyDate})`);
    resolved19.push({ spec, corpRecord });
  }

  // --- 20번째(결산월 ≠ 12) 후보 탐색 ---
  console.log("\n=== 20번째 종목(결산월 ≠ 12) 탐색 ===");
  let spec20: StockSpec | null = null;
  let corpRecord20: CorpCodeRecord | null = null;
  let envelope20: DartEnvelope<CompanyBody> | null = null;
  const attempts: { name: string; stockCode: string; corpCode: string; accMt: string }[] = [];

  for (const candidateName of CANDIDATE_20TH_NAMES) {
    const matches = Array.from(byStock.values()).filter((r) => r.corpName.includes(candidateName));
    if (matches.length === 0) {
      console.log(`  "${candidateName}": corpCode.xml에 상장 레코드 없음, 스킵`);
      continue;
    }
    // 동명이인 대응: modify_date 최신 우선 (이미 dedupeListedByStockCode가 stock_code 단위로 처리했지만,
    // 이름 부분일치로 여러 stock_code가 매칭될 수 있어 여기서도 최신순 정렬)
    matches.sort((a, b) => (a.modifyDate < b.modifyDate ? 1 : -1));
    const candidate = matches[0];
    try {
      const envelope = await fetchCompany(candidate.corpCode);
      const accMt = envelope.body.acc_mt;
      attempts.push({ name: candidateName, stockCode: candidate.stockCode, corpCode: candidate.corpCode, accMt });
      console.log(`  "${candidateName}"(${candidate.stockCode}, corp_code=${candidate.corpCode}) → acc_mt=${accMt}`);
      if (accMt !== "12") {
        spec20 = {
          stockCode: candidate.stockCode,
          name: envelope.body.stock_name || candidateName,
          note: `결산월 ≠ 12 (acc_mt=${accMt}) — 비12월 결산 시계열 실증용으로 선정`,
        };
        corpRecord20 = candidate;
        envelope20 = envelope;
        break;
      }
    } catch (err) {
      console.log(`  "${candidateName}" 조회 실패: ${err instanceof DartClientError ? err.message : err}`);
    }
  }

  if (!spec20 || !corpRecord20 || !envelope20) {
    console.error("\n[실패] 후보 목록 전체가 acc_mt=12였거나 조회 실패. 시도 내역:");
    console.table(attempts);
    throw new Error("20번째(결산월 ≠ 12) 종목을 확정하지 못했습니다. CANDIDATE_20TH_NAMES를 보강하세요.");
  }
  console.log(`\n[확정] 20번째 종목: ${spec20.name}(${spec20.stockCode}), acc_mt=${envelope20.body.acc_mt}`);

  // --- universe.json 조립 ---
  console.log("\n=== universe.json 조립 ===");
  mkdirSync(COMPANY_DIR, { recursive: true });

  const rows: UniverseRow[] = [];
  for (const { spec, corpRecord } of resolved19) {
    const { row, envelope } = await buildRow(spec, corpRecord);
    rows.push(row);
    writeFileSync(join(COMPANY_DIR, `${spec.stockCode}.json`), JSON.stringify(envelope, null, 2) + "\n", "utf-8");
  }
  {
    const { row, envelope } = await buildRow(spec20, corpRecord20);
    rows.push(row);
    writeFileSync(join(COMPANY_DIR, `${spec20.stockCode}.json`), JSON.stringify(envelope, null, 2) + "\n", "utf-8");
  }

  writeFileSync(join(DATA_DIR, "universe.json"), JSON.stringify(rows, null, 2) + "\n", "utf-8");

  // --- 검증 요약 ---
  const finCount = rows.filter((r) => r.profile !== "NON_FIN").length;
  const nonFinCount = rows.length - finCount;
  const nonDecCount = rows.filter((r) => r.accMt !== "12").length;

  console.log("\n=== 완료 ===");
  console.log(`행 수: ${rows.length}`);
  console.log(`금융: ${finCount} / 비금융: ${nonFinCount}`);
  console.log(`accMt !== "12": ${nonDecCount}건`);
  console.table(
    rows.map((r) => ({
      stockCode: r.stockCode,
      name: r.name,
      market: r.market,
      ksic2: r.ksic2,
      accMt: r.accMt,
      profile: r.profile,
      profileSource: r.profileSource,
    })),
  );

  if (rows.length !== 20) throw new Error(`행 수가 20이 아닙니다: ${rows.length}`);
  if (nonDecCount < 1) throw new Error("accMt !== '12'인 행이 0개입니다.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
