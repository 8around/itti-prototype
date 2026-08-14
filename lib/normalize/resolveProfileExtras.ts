/**
 * 프로필별 "요청 시점 손익 확장 후보"를 하나의 진입점으로 묶는다 (T10).
 *
 * FIN_HOLDING·FIN_SECURITIES·FIN_INSURANCE는 각자 다른 계정 카탈로그(fin-holding-catalog.ts·
 * fin-securities-catalog.ts·fin-insurance-catalog.ts)를 쓰지만, 화면(app/stock/[code])은 어느
 * 프로필이든 이 함수 하나만 호출하면 된다 — 지표 키를 화면에서 직접 매핑하지 않는다.
 * STANDARD/FIN_BANK(유니버스에 없음)는 후보가 없어 resolveFinExtras가 즉시 빈 결과를 반환한다.
 */
import { FIN_HOLDING_EXTRA_CANDIDATES } from "./fin-holding-catalog";
import { FIN_INSURANCE_EXTRA_CANDIDATES } from "./fin-insurance-catalog";
import { FIN_SECURITIES_EXTRA_CANDIDATES } from "./fin-securities-catalog";
import type { FinExtrasResult } from "./resolveFinExtras";
import { resolveFinExtras } from "./resolveFinExtras";
import type { MetricCandidate, ProfileId } from "./types";

const EXTRA_CANDIDATES_BY_PROFILE: Partial<Record<ProfileId, MetricCandidate[]>> = {
  FIN_HOLDING: FIN_HOLDING_EXTRA_CANDIDATES,
  // 이번 유니버스엔 FIN_BANK 종목이 없다(T2 이월 노트) — 지주와 동일 계정 체계를 재사용해 둔다.
  FIN_BANK: FIN_HOLDING_EXTRA_CANDIDATES,
  FIN_SECURITIES: FIN_SECURITIES_EXTRA_CANDIDATES,
  FIN_INSURANCE: FIN_INSURANCE_EXTRA_CANDIDATES,
};

export function extraCandidatesFor(profile: ProfileId): MetricCandidate[] {
  return EXTRA_CANDIDATES_BY_PROFILE[profile] ?? [];
}

/** `reprtCode` v2 T2 추가(기본 "11011") — resolveFinExtras와 동일하게 기존 호출부(연간)는 무변. */
export function resolveProfileExtras(snapshotsDir: string, profile: ProfileId, corpCode: string, year: string, reprtCode = "11011"): FinExtrasResult {
  return resolveFinExtras(snapshotsDir, corpCode, year, extraCandidatesFor(profile), reprtCode);
}
