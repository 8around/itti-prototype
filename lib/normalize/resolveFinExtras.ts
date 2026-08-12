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

/**
 * `fnlttSinglAcntAll__{corpCode}__{year}__{reprtCode}__{fsDiv}` 스냅샷 요청 ID — SourcePanel
 * 부착용으로도 재사용된다. `reprtCode`는 v2 T2 추가 — 기본값 "11011"이라 기존 호출부(연간, T7/T10)는
 * 그대로 동작한다.
 */
export function finExtrasAcntAllRequestId(corpCode: string, year: string, fsDiv: FsDiv, reprtCode = "11011"): string {
  return `fnlttSinglAcntAll__${corpCode}__${year}__${reprtCode}__${fsDiv}`;
}

/**
 * candidates가 비어 있으면(STANDARD 프로필 등) 파일 I/O 자체를 생략한다.
 *
 * v2 T2 — `reprtCode`(기본 "11011")·`field`(기본 "thstrm_amount") 파라미터 추가. 금융 확장
 * 후보(fin-*-catalog.ts)는 전부 IS/CIS 계정이라 분기에서도 본 엔진(resolveStockQuarter)과 동일한
 * 규약이 적용된다 — Q1~Q3는 `reprtCode`만 바꿔 `thstrm_amount`를 직독하면 되고, Q4 역산이 필요하면
 * 호출부가 이 함수를 두 번(11011/thstrm_amount, 11014/thstrm_add_amount) 호출해 `deriveQ4`로
 * 직접 합성한다(이 함수 자체는 단일 보고서 읽기만 책임진다 — 원장 엔진과 동일한 책임 분리).
 */
export function resolveFinExtras(
  snapshotsDir: string,
  corpCode: string,
  year: string,
  candidates: MetricCandidate[],
  reprtCode = "11011",
  field: "thstrm_amount" | "thstrm_add_amount" = "thstrm_amount",
): FinExtrasResult {
  if (candidates.length === 0) {
    return { fsDiv: "CFS", fsDivFallbackApplied: false, resolutions: {} };
  }

  const fsRes = resolveFsDiv(
    () => loadSnapshot<AcntAllBody>(snapshotsDir, finExtrasAcntAllRequestId(corpCode, year, "CFS", reprtCode)),
    () => loadSnapshot<AcntAllBody>(snapshotsDir, finExtrasAcntAllRequestId(corpCode, year, "OFS", reprtCode)),
  );
  const list = fsRes.envelope?.body.list ?? [];

  const resolutions: Record<string, Resolution> = {};
  for (const c of candidates) {
    resolutions[c.key] = resolveAcntAllField(c, list, field, fsRes.fsDiv, fsRes.fsDivFallbackApplied);
  }
  return { fsDiv: fsRes.fsDiv, fsDivFallbackApplied: fsRes.fsDivFallbackApplied, resolutions };
}
