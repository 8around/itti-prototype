/**
 * `fnlttSinglIndx` 재무지표 리졸버.
 * `idx_val` 키 부재(29%, #40)와 `"#########"` 오버플로 마커(#41) 모두 parseAmount가 흡수한다.
 */

import type { DartEnvelope } from "../dart/client";
import { parseAmount } from "./parse";
import { PARSER_VERSION } from "./types";
import type { MetricCandidate, Resolution } from "./types";

export interface IndxRow {
  idx_cl_code: string;
  idx_code: string;
  idx_nm: string;
  idx_val?: string;
}

export interface IndxBody {
  status: string;
  list?: IndxRow[];
}

export function resolveIndxMetric(
  candidate: MetricCandidate,
  envelope: DartEnvelope<IndxBody> | null,
  fsDiv: "CFS" | "OFS",
  fsDivFallbackApplied: boolean,
): Resolution {
  const idxCode = candidate.accountIds[0];
  const attempts: Resolution["attempts"] = [];
  let hit: Resolution["hit"];
  let normalized: number | null = null;

  const row = envelope?.body.status === "000" ? envelope.body.list?.find((r) => r.idx_code === idxCode) : undefined;

  if (!row) {
    attempts.push({ accountId: idxCode, result: "NO_ROW" });
  } else {
    const value = parseAmount(row.idx_val);
    if (value === null) {
      attempts.push({ accountId: idxCode, result: "EMPTY_VALUE" });
    } else {
      attempts.push({ accountId: idxCode, result: "HIT" });
      hit = { accountId: idxCode, accountNm: row.idx_nm, sjDiv: candidate.idxClCode ?? "", rawValue: row.idx_val ?? "", ord: 0 };
      normalized = value;
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
