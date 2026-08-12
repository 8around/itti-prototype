/**
 * 금융 프로필(FIN_HOLDING·FIN_SECURITIES·FIN_INSURANCE) 전용 손익 후보를 요청 시점에
 * 스냅샷에서 직접 해석하는 공용 엔진 (T7 resolveFinHoldingExtras.ts를 T10에서 일반화).
 *
 * `engine.ts::resolveStockYear`의 fsDiv 판정 패턴과 동일하나, 대상 후보를 호출부가 넘긴
 * 목록으로 좁혔고 결과를 `data/derived.json`에는 절대 기록하지 않는다(서버 컴포넌트 렌더링
 * 시점 계산 — catalog.ts는 "불변 산출물" 기반이라 프로필 전용 계정을 추가하지 않는다는 T7의
 * 판단을 T10도 그대로 따른다).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { DartEnvelope } from "../dart/client";
import type { AcntAllBody, FsDiv } from "./resolve";
import { resolveAcntAllField, resolveFsDiv } from "./resolve";
import type { MetricCandidate, Resolution } from "./types";

function loadSnapshot<T>(dir: string, requestId: string): DartEnvelope<T> | null {
  const p = join(dir, `${requestId}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as DartEnvelope<T>;
}

export interface FinExtrasResult {
  fsDiv: FsDiv;
  fsDivFallbackApplied: boolean;
  resolutions: Record<string, Resolution>;
}

/** `fnlttSinglAcntAll__{corpCode}__{year}__11011__{fsDiv}` 스냅샷 요청 ID — SourcePanel 부착용으로도 재사용된다. */
export function finExtrasAcntAllRequestId(corpCode: string, year: string, fsDiv: FsDiv): string {
  return `fnlttSinglAcntAll__${corpCode}__${year}__11011__${fsDiv}`;
}

/** candidates가 비어 있으면(STANDARD 프로필 등) 파일 I/O 자체를 생략한다. */
export function resolveFinExtras(snapshotsDir: string, corpCode: string, year: string, candidates: MetricCandidate[]): FinExtrasResult {
  if (candidates.length === 0) {
    return { fsDiv: "CFS", fsDivFallbackApplied: false, resolutions: {} };
  }

  const fsRes = resolveFsDiv(
    () => loadSnapshot<AcntAllBody>(snapshotsDir, finExtrasAcntAllRequestId(corpCode, year, "CFS")),
    () => loadSnapshot<AcntAllBody>(snapshotsDir, finExtrasAcntAllRequestId(corpCode, year, "OFS")),
  );
  const list = fsRes.envelope?.body.list ?? [];

  const resolutions: Record<string, Resolution> = {};
  for (const c of candidates) {
    resolutions[c.key] = resolveAcntAllField(c, list, "thstrm_amount", fsRes.fsDiv, fsRes.fsDivFallbackApplied);
  }
  return { fsDiv: fsRes.fsDiv, fsDivFallbackApplied: fsRes.fsDivFallbackApplied, resolutions };
}
