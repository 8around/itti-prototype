/**
 * FIN_HOLDING 전용 손익 6종(fin-holding-catalog.ts)을 요청 시점에 스냅샷에서 직접 해석한다.
 *
 * T10에서 `resolveFinExtras.ts`로 알고리즘을 일반화했다 — 이 파일은 이제 그 위에 얹힌 얇은
 * 래퍼다(compare/pnl page.tsx·기존 vitest가 이 파일의 이름 그대로 import하므로 공개 API는
 * 그대로 유지한다). FIN_SECURITIES/FIN_INSURANCE 버전은 resolveProfileExtras.ts 참조.
 */
import { FIN_HOLDING_EXTRA_CANDIDATES } from "./fin-holding-catalog";
import { finExtrasAcntAllRequestId, resolveFinExtras } from "./resolveFinExtras";
import type { FinExtrasResult } from "./resolveFinExtras";
import type { FsDiv } from "./resolve";

export type FinHoldingExtrasResult = FinExtrasResult;

/** @deprecated 이름 그대로 유지(하위 호환) — 신규 코드는 resolveFinExtras.ts의 finExtrasAcntAllRequestId를 직접 쓴다. */
export function finHoldingAcntAllRequestId(corpCode: string, year: string, fsDiv: FsDiv): string {
  return finExtrasAcntAllRequestId(corpCode, year, fsDiv);
}

export function resolveFinHoldingExtras(snapshotsDir: string, corpCode: string, year: string): FinHoldingExtrasResult {
  return resolveFinExtras(snapshotsDir, corpCode, year, FIN_HOLDING_EXTRA_CANDIDATES);
}
