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
import { extraCandidatesFor } from "./normalize/resolveProfileExtras";
import type { MetricCandidate, MetricSource, ProfileId, Resolution } from "./normalize/types";
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

/**
 * 지표 키 → 후보 선언(MetricCandidate) 역색인.
 *
 * 리뷰 픽스(T10 라운드 1): `BASE_CANDIDATES`(T4 원장 4원천)는 전역에서 key가 유일하지만,
 * 프로필별 확장 카탈로그(FIN_HOLDING/FIN_SECURITIES/FIN_INSURANCE)는 **서로 다른 프로필에서
 * 같은 key를 다른 account_id로 재사용한다** — 예: `insurance_result`는 FIN_HOLDING에서
 * `dart_InsuranceRevenueExpense`(보험서비스결과), FIN_INSURANCE에서 `ifrs-full_InsuranceServiceResult`
 * (보험손익)로 서로 다른 정의다. 과거처럼 이 셋을 flat concat한 뒤 `.find()`(first-match)로
 * 찾으면 프로필이 바뀌어도 항상 같은(먼저 나온) 정의가 반환돼 SourcePanel이 엉뚱한 원천으로
 * 조립될 수 있다 — 반드시 profile로 스코프를 좁혀서 찾는다.
 */
const BASE_CANDIDATES: MetricCandidate[] = [...ACNT_ALL_CANDIDATES, ...SINGL_INDX_CANDIDATES, ...ALOT_MATTER_CANDIDATES, ...STOCK_TOTQY_CANDIDATES];

/** profile 매치가 실패했을 때만 쓰는 전역 안전망 — 정상 호출 경로에서는 도달하지 않아야 한다. */
const ALL_EXTRA_CANDIDATES: MetricCandidate[] = [...FIN_HOLDING_EXTRA_CANDIDATES, ...FIN_SECURITIES_EXTRA_CANDIDATES, ...FIN_INSURANCE_EXTRA_CANDIDATES];

/**
 * 리뷰 픽스(I1b) — q4_역산값·roa·operating_margin·fcf처럼 자체 MetricCandidate가 없는 파생
 * 지표 대부분은 acntAll 스냅샷 값으로 계산되므로 "acntAll로 간주"가 맞는 기본값이다. 하지만
 * `dividend_payout_fallback`(배당총액÷지배주주 귀속 순이익)은 alotMatter 스냅샷의 두 행을
 * 합성한 값이라 acntAll로 간주하면 SourcePanel "원문 보기"에 엉뚱한 acntAll JSON이 뜬다 —
 * 원천만 alotMatter로 오버라이드한다(카카오 29,857/55,277 등 alotMatter 원본 도달 보장).
 */
const DERIVED_SOURCE_OVERRIDES: Partial<Record<string, MetricSource>> = {
  dividend_payout_fallback: "alotMatter",
};

function findCandidate(metricKey: string, profile: ProfileId): MetricCandidate | undefined {
  // q4_역산값·roa·operating_margin·fcf처럼 자체 후보가 없는 파생 지표는 여기서 못 찾는다
  // (derive.ts가 다른 Resolution을 입력으로 계산) — undefined면 호출부가 acntAll로 간주한다.
  const base = BASE_CANDIDATES.find((c) => c.key === metricKey);
  if (base) return base;
  // resolveProfileExtras.ts와 동일한 매핑(EXTRA_CANDIDATES_BY_PROFILE)을 재사용해 화면이 실제로
  // merge해서 쓰는 것과 같은 카탈로그에서만 찾는다.
  const scoped = extraCandidatesFor(profile).find((c) => c.key === metricKey);
  if (scoped) return scoped;
  const extra = ALL_EXTRA_CANDIDATES.find((c) => c.key === metricKey);
  if (extra) return extra;
  const overrideSource = DERIVED_SOURCE_OVERRIDES[metricKey];
  if (!overrideSource) return undefined;
  return { key: metricKey, label: metricKey, accountIds: [], sjDivPriority: [], unit: "PCT", sourceAvailable: true, source: overrideSource };
}

/**
 * 지표 하나(metricKey)의 SourcePanel props를 원천에 맞게 조립한다 — 화면은 이 함수만 호출하면
 * 되고 acntAll/singlIndx/alotMatter/stockTotqy 4갈래 분기를 직접 하지 않는다.
 * `panelUnit`은 SourcePanel 정규화 탭 표기 기준(KRW/PCT/X) — MetricValue 전용 단위(WON/SHARES)와
 * 별개다(SourcePanel.tsx 주석 참조).
 *
 * v2 T5 — `reprtCode`(기본 "11011" = 연간)는 분기 차트가 해당 분기의 실제 스냅샷
 * (11013/11012/11014/11011)을 가리키게 하려고 추가했다. singlIndx/alotMatter/stockTotqy는
 * 분기 미수집(T1V)이라 이 값을 쓰지 않는다 — acntAll 분기(revenue/operating_income 등)에서만
 * 의미가 있다. 기본값이 기존 동작과 동일해 연간 호출부(40여 곳)는 전부 무변경이다.
 */
export function buildSourcePanelProps(
  metricKey: string,
  corpCode: string,
  year: string,
  resolution: Resolution,
  panelUnit: "KRW" | "PCT" | "X",
  profile: ProfileId,
  reprtCode = "11011",
): SourcePanelProps {
  const candidate = findCandidate(metricKey, profile);
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

  // acntAll + 파생(q4_*/roa/operating_margin/fcf/dividend_payout_fallback/qoq_*/yoy_* 등) 공통 —
  // 파생 지표는 전부 같은 연도(분기)의 acntAll 스냅샷 값으로 계산되므로 그 스냅샷을 "근거 원문"으로
  // 보여준다.
  const requestId = acntAllRequestId(corpCode, year, resolution.fsDiv, reprtCode);
  return {
    resolution,
    requestId,
    probeParams: acntAllProbeParams(corpCode, year, resolution.fsDiv, reprtCode),
    summaryMeta: { source: "DART 사업보고서", basis: basisLabel(resolution.fsDiv), asOf: reportDateFromSnapshot(requestId), parserVersion: resolution.parserVersion, unit: panelUnit },
  };
}
