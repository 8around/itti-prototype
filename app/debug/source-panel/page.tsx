import { readFileSync } from "node:fs";
import { join } from "node:path";

import SourcePanel from "@/components/SourcePanel";
import type { FsDiv } from "@/lib/normalize/resolve";
import type { Resolution } from "@/lib/normalize/types";

import styles from "./page.module.css";

/**
 * T5 SourcePanel 데모 겸 검증 페이지. derived.json(T4 산출물)에서 4개 사례를 골라
 * SourcePanel을 그대로 렌더한다 — T7(프로필 엔진)·T10(종목 상세)이 이 컴포넌트를
 * 그대로 갖다 쓸 때의 사용 예시를 겸한다.
 *
 * 서버 컴포넌트: derived.json/스냅샷 파일을 읽어 SourcePanel의 props(resolution·requestId·
 * probeParams·summaryMeta)만 계산한다. 원본 리스트(body.list) 자체는 절대 이 페이지에서
 * 렌더하지 않는다 — SourcePanel 내부(클라이언트)가 details를 펼칠 때만 lazy fetch한다.
 */

interface YearResolutions {
  year: string;
  fsDiv: FsDiv;
  fsDivFallbackApplied: boolean;
  resolutions: Record<string, Resolution>;
}

interface DerivedStock {
  stockCode: string;
  corpCode: string;
  name: string;
  years: YearResolutions[];
}

interface DerivedFile {
  stocks: DerivedStock[];
}

function loadDerived(): DerivedFile {
  const raw = readFileSync(join(process.cwd(), "data", "derived.json"), "utf-8");
  return JSON.parse(raw) as DerivedFile;
}

function pickResolution(derived: DerivedFile, name: string, year: string, metricKey: string) {
  const stock = derived.stocks.find((s) => s.name === name);
  if (!stock) throw new Error(`데모 데이터에 종목이 없습니다: ${name}`);
  const yearData = stock.years.find((y) => y.year === year);
  if (!yearData) throw new Error(`데모 데이터에 연도가 없습니다: ${name} ${year}`);
  const resolution = yearData.resolutions[metricKey];
  if (!resolution) throw new Error(`데모 데이터에 지표가 없습니다: ${name} ${year} ${metricKey}`);
  return { stock, yearData, resolution };
}

/** rcept_no(접수번호) 앞 8자리가 접수일(YYYYMMDD)이다 — 브리프 목업의 "기준일" 표기용. */
function reportDateFromSnapshot(requestId: string): string {
  try {
    const raw = readFileSync(join(process.cwd(), "public", "snapshots", `${requestId}.json`), "utf-8");
    const data = JSON.parse(raw) as { body?: { list?: { rcept_no?: string }[] } };
    const rcept = data.body?.list?.[0]?.rcept_no;
    if (rcept && rcept.length >= 8) {
      return `${rcept.slice(0, 4)}.${rcept.slice(4, 6)}.${rcept.slice(6, 8)}`;
    }
  } catch {
    // 스냅샷이 없거나 rcept_no가 없으면 "-"로 대체 — 데모용 방어 코드.
  }
  return "-";
}

const basisLabel = (fsDiv: FsDiv) => (fsDiv === "CFS" ? ("연결" as const) : ("별도" as const));

function acntAllRequestId(corpCode: string, year: string, fsDiv: FsDiv): string {
  return `fnlttSinglAcntAll__${corpCode}__${year}__11011__${fsDiv}`;
}

function acntAllProbeParams(corpCode: string, year: string, fsDiv: FsDiv): Record<string, string> {
  return { endpoint: "fnlttSinglAcntAll", corp_code: corpCode, bsns_year: year, reprt_code: "11011", fs_div: fsDiv };
}

export default function SourcePanelDebugPage() {
  const derived = loadDerived();

  const samsungRevenue = pickResolution(derived, "삼성전자", "2024", "revenue");
  const kbRevenue = pickResolution(derived, "KB금융", "2024", "revenue");
  const helixmithEps = pickResolution(derived, "헬릭스미스", "2024", "eps_basic");
  const samsungQ4Revenue = pickResolution(derived, "삼성전자", "2024", "q4_revenue");

  const cases = [
    {
      key: "samsung-revenue",
      title: "① 삼성전자 2024 매출액 — 정상 HIT",
      ...samsungRevenue,
    },
    {
      key: "kb-revenue",
      title: "② KB금융 2024 매출액 — NO_ROW 폴백 이력 (금융 프로필, ifrs-full_Revenue 행 없음)",
      ...kbRevenue,
    },
    {
      key: "helixmith-eps",
      // 실측(derived.json): attempts 4건 중 4번째(2번째 후보 계정 …FromContinuingOperations @CIS)에서 HIT.
      title: "③ 헬릭스미스 2024 기본주당이익 — 폴백 4회 시도 중 4번째(2번째 후보 계정 @CIS)에서 HIT",
      ...helixmithEps,
    },
    {
      key: "samsung-q4-revenue",
      title: "④ 삼성전자 2024 4분기 매출액 — 파생 계산식(Q4 = 연간 − 3분기 누적)",
      ...samsungQ4Revenue,
    },
  ];

  return (
    <main className={styles.main}>
      <h1>SourcePanel 데모 (/debug/source-panel)</h1>
      <p className={styles.hint}>
        T5 SourcePanel의 검증 겸 T7·T10 사용 예시. 아래 각 카드의 <code>.srcfoot</code> 요약 줄을 펼치면 그때 처음
        원본 스냅샷 JSON을 fetch한다 — 이 페이지의 초기 HTML(View Source)에는 원본 응답이 들어있지 않다.
      </p>

      {cases.map((c) => (
        <section key={c.key} className={styles.card}>
          <h2>{c.title}</h2>
          <SourcePanel
            resolution={c.resolution}
            requestId={acntAllRequestId(c.stock.corpCode, c.yearData.year, c.yearData.fsDiv)}
            probeParams={acntAllProbeParams(c.stock.corpCode, c.yearData.year, c.yearData.fsDiv)}
            summaryMeta={{
              source: "DART 사업보고서",
              basis: basisLabel(c.resolution.fsDiv),
              asOf: reportDateFromSnapshot(acntAllRequestId(c.stock.corpCode, c.yearData.year, c.yearData.fsDiv)),
              parserVersion: c.resolution.parserVersion,
              // 데모 4건 전부 catalog.ts의 revenue/eps_basic 후보 선언(unit: "KRW")과 동일한 원천.
              unit: "KRW",
            }}
          />
        </section>
      ))}
    </main>
  );
}
