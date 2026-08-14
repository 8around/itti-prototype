/**
 * `/`(20종목 리스트)와 `/stock/[code]`(종목 상세)가 공유하는 "종목×연도 조회" 헬퍼 (T10).
 *
 * derived.json(T4, 불변)의 종목×연도 resolutions에 프로필별 확장 손익(resolveProfileExtras,
 * T7/T10)을 요청 시점에 병합한다 — compare/pnl page.tsx가 KB금융 한 종목에 대해 하던 패턴을
 * 20종목 전체로 일반화했다. 화면(app/page.tsx, app/stock/[code]/page.tsx)은 이 함수만 호출하면
 * 되고, 어떤 프로필이 어떤 확장 후보를 쓰는지는 몰라도 된다.
 */
import { join } from "node:path";

import { findStockByCode, findYear, loadDerived } from "./derived";
import type { DerivedFile } from "./derived";
import type { QuarterResolutions } from "./normalize/engine";
import { resolveProfileExtrasQuarters } from "./normalize/resolveFinExtrasQuarters";
import type { FsDiv } from "./normalize/resolve";
import { resolveProfileExtras } from "./normalize/resolveProfileExtras";
import type { Resolution } from "./normalize/types";
import { toProfileId } from "./profiles";
import type { ProfileId } from "./normalize/types";
import universeRaw from "@/data/universe.json";

export const SNAPSHOTS_DIR = join(process.cwd(), "public", "snapshots");

export interface UniverseRow {
  stockCode: string;
  corpCode: string;
  name: string;
  market: string;
  indutyCode: string;
  ksic2: string;
  accMt: string;
  profile: string;
  profileSource: string;
  note: string;
}

export const UNIVERSE: UniverseRow[] = universeRaw;

export function findUniverseRow(stockCode: string): UniverseRow {
  const row = UNIVERSE.find((r) => r.stockCode === stockCode);
  if (!row) throw new Error(`universe.json에 종목이 없습니다: ${stockCode}`);
  return row;
}

export interface StockYearView {
  year: string;
  fsDiv: FsDiv;
  fsDivFallbackApplied: boolean;
  resolutions: Record<string, Resolution>;
}

let cachedDerived: DerivedFile | null = null;
/** 정적 빌드 시 20종목 × 3연도가 반복 호출하므로 파일 파싱을 프로세스당 1회로 캐시한다. */
export function getDerived(): DerivedFile {
  if (!cachedDerived) cachedDerived = loadDerived();
  return cachedDerived;
}

export function loadStockYearView(row: UniverseRow, year: string, derived: DerivedFile = getDerived()): StockYearView {
  const stock = findStockByCode(derived, row.stockCode);
  const base = findYear(stock, year);
  const profileId = toProfileId(row.profile);
  const extras = resolveProfileExtras(SNAPSHOTS_DIR, profileId, row.corpCode, year);
  return {
    year,
    fsDiv: base.fsDiv,
    fsDivFallbackApplied: base.fsDivFallbackApplied,
    resolutions: { ...base.resolutions, ...extras.resolutions },
  };
}

export function profileIdOf(row: UniverseRow): ProfileId {
  return toProfileId(row.profile);
}

/**
 * v2 T5 — derived.json의 종목별 quarters[](T2 산출, 16개)를 그대로 노출한다. `loadStockYearView`와
 * 달리 프로필 확장(resolveProfileExtras)을 병합하지 않는다 — 금융 프로필의 분기 확장 지표는
 * T6 범위(브리프 명시 "금융 프로필은 이번 범위 밖")라 여기서는 base quarters만 반환한다.
 */
export function loadStockQuarters(row: UniverseRow, derived: DerivedFile = getDerived()): QuarterResolutions[] {
  const stock = findStockByCode(derived, row.stockCode);
  return stock.quarters;
}

/**
 * v2 T6 — `loadStockQuarters`(base만)에 금융 프로필 확장 손익(net_interest_income·net_fee_income·
 * insurance_result 등)의 분기 resolutions를 요청 시점에 병합한다. `loadStockYearView`가 연간에서
 * 이미 하던 패턴(resolveProfileExtras 병합)의 분기판이다. STANDARD 프로필은 확장 후보가 없어
 * (`extraCandidatesFor` 빈 배열) `resolveProfileExtrasQuarters`가 파일 I/O 없이 즉시 `[]`를
 * 반환하므로 base 배열을 그대로 돌려준다 — 표준 프로필 섹션(T5)은 이 함수를 써도 동작이
 * 완전히 동일하다(additive, 회귀 없음).
 */
export function loadStockQuartersWithFinExtras(row: UniverseRow, derived: DerivedFile = getDerived()): QuarterResolutions[] {
  const base = loadStockQuarters(row, derived);
  const profileId = toProfileId(row.profile);
  const extraQuarters = resolveProfileExtrasQuarters(SNAPSHOTS_DIR, profileId, row.corpCode);
  if (extraQuarters.length === 0) return base;

  const extrasByPeriod = new Map(extraQuarters.map((q) => [q.period, q.resolutions]));
  return base.map((q) => ({ ...q, resolutions: { ...q.resolutions, ...(extrasByPeriod.get(q.period) ?? {}) } }));
}
