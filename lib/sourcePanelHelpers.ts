/**
 * `fnlttSinglAcntAll` 계열 SourcePanel 부착에 필요한 요청 ID·probe 파라미터·기준일 헬퍼.
 * app/compare/pnl/page.tsx가 로컬로 갖고 있던 것과 동일한 로직을 T10(app/stock/[code])이
 * 재사용할 수 있도록 공용 모듈로 뺐다 — compare/pnl 자체는 리뷰 완료된 코드라 손대지 않는다.
 *
 * T10은 compare/pnl과 달리 4개 원천(acntAll·singlIndx·alotMatter·stockTotqy)을 전부 화면에
 * 노출한다(ROE·배당·발행주식수 등) — `buildSourcePanelProps`가 지표 키로 원천을 판별해 SourcePanel에
 * "그 지표가 실제로 나온" 스냅샷 파일을 붙인다. acntAll requestId를 아무 지표에나 붙이면
 * SinglIndx/alotMatter/stockTotqy 지표의 "원문 보기" 탭에 엉뚱한 JSON이 뜨는 버그가 된다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ACNT_ALL_CANDIDATES, ALOT_MATTER_CANDIDATES, SINGL_INDX_CANDIDATES, STOCK_TOTQY_CANDIDATES } from "./normalize/catalog";
import { ALOT_MATTER_REPORT_YEAR } from "./normalize/engine";
import { FIN_HOLDING_EXTRA_CANDIDATES } from "./normalize/fin-holding-catalog";
import { FIN_INSURANCE_EXTRA_CANDIDATES } from "./normalize/fin-insurance-catalog";
import { FIN_SECURITIES_EXTRA_CANDIDATES } from "./normalize/fin-securities-catalog";
import type { FsDiv } from "./normalize/resolve";
import type { MetricCandidate, Resolution } from "./normalize/types";
import type { SourcePanelProps } from "@/components/SourcePanel";

const SNAPSHOTS_DIR = join(process.cwd(), "public", "snapshots");

export const basisLabel = (fsDiv: FsDiv) => (fsDiv === "CFS" ? ("연결" as const) : ("별도" as const));

export function acntAllRequestId(corpCode: string, year: string, fsDiv: FsDiv, reprt = "11011"): string {
  return `fnlttSinglAcntAll__${corpCode}__${year}__${reprt}__${fsDiv}`;
}

export function acntAllProbeParams(corpCode: string, year: string, fsDiv: FsDiv, reprt = "11011"): Record<string, string> {
  return { endpoint: "fnlttSinglAcntAll", corp_code: corpCode, bsns_year: year, reprt_code: reprt, fs_div: fsDiv };
}

export function indxProbeParams(corpCode: string, year: string, idxClCode: string): Record<string, string> {
  return { endpoint: "fnlttSinglIndx", corp_code: corpCode, bsns_year: year, reprt_code: "11011", idx_cl_code: idxClCode };
}

export function alotMatterProbeParams(corpCode: string, year: string): Record<string, string> {
  return { endpoint: "alotMatter", corp_code: corpCode, bsns_year: year, reprt_code: "11011" };
}

export function stockTotqyProbeParams(corpCode: string, year: string): Record<string, string> {
  return { endpoint: "stockTotqySttus", corp_code: corpCode, bsns_year: year, reprt_code: "11011" };
}

/** rcept_no(접수번호) 앞 8자리가 접수일(YYYYMMDD)이다 — T5 debug/source-panel과 동일한 패턴. */
export function reportDateFromSnapshot(requestId: string): string {
  try {
    const raw = readFileSync(join(SNAPSHOTS_DIR, `${requestId}.json`), "utf-8");
    const data = JSON.parse(raw) as { body?: { list?: { rcept_no?: string }[] } };
    const rcept = data.body?.list?.[0]?.rcept_no;
    if (rcept && rcept.length >= 8) {
      return `${rcept.slice(0, 4)}.${rcept.slice(4, 6)}.${rcept.slice(6, 8)}`;
    }
  } catch {
    // 스냅샷이 없거나 rcept_no가 없으면 "-"로 대체 — 방어 코드.
  }
  return "-";
}

/** 지표 키 → 후보 선언(MetricCandidate) 역색인. q4_역산값·roa·operating_margin·fcf·dividend_payout_fallback처럼
 *  파생 지표는 자체 후보가 없다(derive.ts가 다른 Resolution을 입력으로 계산) — undefined면 acntAll로 간주한다. */
const ALL_CANDIDATES: MetricCandidate[] = [
  ...ACNT_ALL_CANDIDATES,
  ...SINGL_INDX_CANDIDATES,
  ...ALOT_MATTER_CANDIDATES,
  ...STOCK_TOTQY_CANDIDATES,
  ...FIN_HOLDING_EXTRA_CANDIDATES,
  ...FIN_SECURITIES_EXTRA_CANDIDATES,
  ...FIN_INSURANCE_EXTRA_CANDIDATES,
];

function findCandidate(metricKey: string): MetricCandidate | undefined {
  return ALL_CANDIDATES.find((c) => c.key === metricKey);
}

/**
 * 지표 하나(metricKey)의 SourcePanel props를 원천에 맞게 조립한다 — 화면은 이 함수만 호출하면
 * 되고 acntAll/singlIndx/alotMatter/stockTotqy 4갈래 분기를 직접 하지 않는다.
 * `panelUnit`은 SourcePanel 정규화 탭 표기 기준(KRW/PCT/X) — MetricValue 전용 단위(WON/SHARES)와
 * 별개다(SourcePanel.tsx 주석 참조).
 */
export function buildSourcePanelProps(
  metricKey: string,
  corpCode: string,
  year: string,
  resolution: Resolution,
  panelUnit: "KRW" | "PCT" | "X",
): SourcePanelProps {
  const candidate = findCandidate(metricKey);
  const source = candidate?.source ?? "acntAll";

  if (source === "singlIndx") {
    const idxClCode = candidate?.idxClCode ?? "M210000";
    const requestId = `fnlttSinglIndx__${corpCode}__${year}__11011__${idxClCode}`;
    return {
      resolution,
      requestId,
      probeParams: indxProbeParams(corpCode, year, idxClCode),
      summaryMeta: { source: "DART 사업보고서", basis: basisLabel(resolution.fsDiv), asOf: reportDateFromSnapshot(requestId), parserVersion: resolution.parserVersion, unit: panelUnit },
    };
  }
  if (source === "alotMatter") {
    // alotMatter는 항상 bsns_year=ALOT_MATTER_REPORT_YEAR(2025) 보고서 1건이 연도별 컬럼(thstrm/frmtrm/lwfr)으로
    // 3개년을 커버한다 — year 파라미터(예: 2024)와 요청 URL의 bsns_year(2025)가 다른 것이 정상이다.
    const requestId = `alotMatter__${corpCode}__${ALOT_MATTER_REPORT_YEAR}__11011`;
    return {
      resolution,
      requestId,
      probeParams: alotMatterProbeParams(corpCode, ALOT_MATTER_REPORT_YEAR),
      summaryMeta: { source: "DART 사업보고서(배당에 관한 사항)", basis: basisLabel(resolution.fsDiv), asOf: reportDateFromSnapshot(requestId), parserVersion: resolution.parserVersion, unit: panelUnit },
    };
  }
  if (source === "stockTotqy") {
    const requestId = `stockTotqySttus__${corpCode}__${year}__11011`;
    return {
      resolution,
      requestId,
      probeParams: stockTotqyProbeParams(corpCode, year),
      summaryMeta: { source: "DART 사업보고서(주식의 총수 현황)", basis: basisLabel(resolution.fsDiv), asOf: reportDateFromSnapshot(requestId), parserVersion: resolution.parserVersion, unit: panelUnit },
    };
  }

  // acntAll + 파생(q4_*/roa/operating_margin/fcf/dividend_payout_fallback) 공통 — 파생 지표는
  // 전부 같은 연도의 acntAll 스냅샷 값으로 계산되므로 그 스냅샷을 "근거 원문"으로 보여준다.
  const requestId = acntAllRequestId(corpCode, year, resolution.fsDiv);
  return {
    resolution,
    requestId,
    probeParams: acntAllProbeParams(corpCode, year, resolution.fsDiv),
    summaryMeta: { source: "DART 사업보고서", basis: basisLabel(resolution.fsDiv), asOf: reportDateFromSnapshot(requestId), parserVersion: resolution.parserVersion, unit: panelUnit },
  };
}
