/**
 * `fnlttSinglAcntAll` 원장 지표 폴백 체인 실행기.
 *
 * - `account_detail === "-"` 필터가 사실상 본표 합계행 필터다.
 * - `accountIds`(폴백 후보) × `sjDivPriority`(재무제표 우선순위) 순서로 시도하고
 *   각 시도를 HIT/NO_ROW/EMPTY_VALUE로 attempts에 남긴다.
 * - `ifrs-full_ProfitLoss`의 IS/CIS/CF 3중복(#35)은 sjDivPriority에서 첫 HIT로 자연히 dedupe된다.
 * - `sj_div in ("IS","CIS")` + IS 우선 폴백 (#32) — sjDivPriority=["IS","CIS"]로 표현된다.
 */

import type { DartEnvelope } from "../dart/client";
import { parseAmount } from "./parse";
import { PARSER_VERSION } from "./types";
import type { AttemptResult, MetricCandidate, Resolution } from "./types";

export interface AcntAllRow {
  account_id: string;
  account_nm: string;
  account_detail: string;
  sj_div: string;
  ord: string;
  thstrm_amount?: string;
  thstrm_add_amount?: string;
  /** v2 T2 — 분기 축 fiscalPeriodName 원문 추출용 (예: "제 56 기 1분기", 신영증권처럼 비12월
   *  결산 종목은 bsns_year만으로 기수가 정렬되지 않아 화면 라벨로 원문을 그대로 노출한다). */
  thstrm_nm?: string;
}

export interface AcntAllBody {
  status: string;
  message: string;
  list?: AcntAllRow[];
}

export type FsDiv = "CFS" | "OFS";

export interface FsDivResolution {
  fsDiv: FsDiv;
  fsDivFallbackApplied: boolean;
  envelope: DartEnvelope<AcntAllBody> | null;
}

/**
 * CFS 시도 → `013`이면 OFS 재시도 (#37). "연결 미작성"과 "데이터 없음"이 동일한 013으로
 * 오므로 구분하지 않고 그대로 폴백한다. 둘 다 실패하면 envelope=null(→ 호출부가 MISSING 전파).
 */
export function resolveFsDiv(
  loadCfs: () => DartEnvelope<AcntAllBody> | null,
  loadOfs: () => DartEnvelope<AcntAllBody> | null,
): FsDivResolution {
  const cfs = loadCfs();
  if (cfs && cfs.body.status === "000") {
    return { fsDiv: "CFS", fsDivFallbackApplied: false, envelope: cfs };
  }
  const ofs = loadOfs();
  if (ofs && ofs.body.status === "000") {
    return { fsDiv: "OFS", fsDivFallbackApplied: true, envelope: ofs };
  }
  // 둘 다 실패(013 등) — 신영증권 FY2023처럼 해당 연도 전체가 MISSING인 케이스.
  return { fsDiv: "CFS", fsDivFallbackApplied: false, envelope: null };
}

/**
 * `field`(`thstrm_amount` 또는 `thstrm_add_amount`)를 기준으로 후보 폴백 체인을 실행한다.
 * `thstrm_add_amount`는 4Q 역산(derive.ts)에서 11014 스냅샷을 읽을 때만 쓰인다.
 */
export function resolveAcntAllField(
  candidate: MetricCandidate,
  list: AcntAllRow[],
  field: "thstrm_amount" | "thstrm_add_amount",
  fsDiv: FsDiv,
  fsDivFallbackApplied: boolean,
): Resolution {
  const attempts: { accountId: string; sjDiv?: string; result: AttemptResult }[] = [];
  let hit: Resolution["hit"];
  let normalized: number | null = null;

  outer: for (const accountId of candidate.accountIds) {
    for (const sjDiv of candidate.sjDivPriority) {
      const row = list.find((r) => r.account_id === accountId && r.account_detail === "-" && r.sj_div === sjDiv);
      if (!row) {
        attempts.push({ accountId, sjDiv, result: "NO_ROW" });
        continue;
      }
      const raw = row[field];
      const value = parseAmount(raw);
      if (value === null) {
        attempts.push({ accountId, sjDiv, result: "EMPTY_VALUE" });
        continue;
      }
      attempts.push({ accountId, sjDiv, result: "HIT" });
      hit = { accountId, accountNm: row.account_nm, sjDiv, rawValue: raw ?? "", ord: Number(row.ord) };
      normalized = value;
      break outer;
    }
  }

  return {
    metricKey: candidate.key,
    attempts,
    hit,
    fsDiv,
    fsDivFallbackApplied,
    normalized,
    displayState: normalized !== null ? "OK" : "MISSING",
    parserVersion: PARSER_VERSION,
  };
}
