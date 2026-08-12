/**
 * FIN_HOLDING 전용 손익 6종(fin-holding-catalog.ts)을 요청 시점에 스냅샷에서 직접 해석한다.
 * `engine.ts::resolveStockYear`의 fsDiv 판정 패턴과 동일하나, 대상 후보만 이 6개로 좁혔고
 * 결과를 `data/derived.json`에는 절대 기록하지 않는다(서버 컴포넌트 렌더링 시점 계산 — T7
 * 브리프의 "derived.json을 수정하지 마세요" 제약 그대로 준수).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { DartEnvelope } from "../dart/client";
import { FIN_HOLDING_EXTRA_CANDIDATES } from "./fin-holding-catalog";
import type { AcntAllBody, FsDiv } from "./resolve";
import { resolveAcntAllField, resolveFsDiv } from "./resolve";
import type { Resolution } from "./types";

function loadSnapshot<T>(dir: string, requestId: string): DartEnvelope<T> | null {
  const p = join(dir, `${requestId}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as DartEnvelope<T>;
}

export interface FinHoldingExtrasResult {
  fsDiv: FsDiv;
  fsDivFallbackApplied: boolean;
  resolutions: Record<string, Resolution>;
}

/** `fnlttSinglAcntAll__{corpCode}__{year}__11011__{fsDiv}` 스냅샷 요청 ID — SourcePanel 부착용으로도 재사용된다. */
export function finHoldingAcntAllRequestId(corpCode: string, year: string, fsDiv: FsDiv): string {
  return `fnlttSinglAcntAll__${corpCode}__${year}__11011__${fsDiv}`;
}

export function resolveFinHoldingExtras(snapshotsDir: string, corpCode: string, year: string): FinHoldingExtrasResult {
  const fsRes = resolveFsDiv(
    () => loadSnapshot<AcntAllBody>(snapshotsDir, finHoldingAcntAllRequestId(corpCode, year, "CFS")),
    () => loadSnapshot<AcntAllBody>(snapshotsDir, finHoldingAcntAllRequestId(corpCode, year, "OFS")),
  );
  const list = fsRes.envelope?.body.list ?? [];

  const resolutions: Record<string, Resolution> = {};
  for (const c of FIN_HOLDING_EXTRA_CANDIDATES) {
    resolutions[c.key] = resolveAcntAllField(c, list, "thstrm_amount", fsRes.fsDiv, fsRes.fsDivFallbackApplied);
  }
  return { fsDiv: fsRes.fsDiv, fsDivFallbackApplied: fsRes.fsDivFallbackApplied, resolutions };
}
