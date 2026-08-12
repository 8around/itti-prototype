import { describe, expect, it } from "vitest";

import { ALOT_MATTER_CANDIDATES } from "./catalog";
import { resolveAlotMatterMetric, resolveDividendPayoutFallback } from "./resolve-alotmatter";
import type { AlotBody } from "./resolve-alotmatter";
import { CORP, loadFixture } from "./test-support";

function candidate(key: string) {
  const c = ALOT_MATTER_CANDIDATES.find((c) => c.key === key);
  if (!c) throw new Error(`candidate not found: ${key}`);
  return c;
}

function alot(corpCode: string) {
  return loadFixture<AlotBody>(`alotMatter__${corpCode}__2025__11011`);
}

describe("resolveAlotMatterMetric — 인덱스+라벨 이중검증 (#22)", () => {
  it("2025 보고서 1건이 15행(2017+ 스키마)이며 thstrm/frmtrm/lwfr = 2025/2024/2023을 담는다", () => {
    const env = alot(CORP.삼성전자);
    expect(env.body.list).toHaveLength(15);
  });

  it("헬릭스미스 DPS — 배당행 '-'인데 순이익행은 값 존재 → ZERO_BY_FACT, dps=0 (#22)", () => {
    const env = alot(CORP.헬릭스미스);
    // 2025 보고서의 thstrm(FY2025)/frmtrm(FY2024)/lwfr(FY2023) 모두 순손실이지만 배당행은 전부 "-".
    for (const column of ["thstrm", "frmtrm", "lwfr"] as const) {
      const res = resolveAlotMatterMetric(candidate("dps_common"), env, column, "CFS", false);
      expect(res.normalized).toBe(0);
      expect(res.displayState).toBe("ZERO_BY_FACT");
    }
  });

  it("카카오 현금배당수익률 — 배당수익률(idx7) 값 정상 수신", () => {
    const env = alot(CORP.카카오);
    const res = resolveAlotMatterMetric(candidate("dividend_yield_common"), env, "lwfr", "CFS", false);
    // ds002 문서 실측: 카카오 2023 배당수익률 0.10%
    expect(res.displayState).toBe("OK");
    expect(res.normalized).toBeCloseTo(0.1);
  });

  it("stock_knd를 필터 조건으로 쓰지 않는다 — dps_common은 항상 idx11(보통주) 행을 읽는다", () => {
    const env = alot(CORP.카카오);
    const row = env.body.list?.[11];
    expect(row?.stock_knd).toBe("보통주"); // #22 — stock_knd가 "-"인 회사도 있으나 위치 판정은 불변
  });

  it("envelope이 없으면 NO_ROW → MISSING", () => {
    const res = resolveAlotMatterMetric(candidate("eps_alotmatter"), null, "thstrm", "CFS", false);
    expect(res.displayState).toBe("MISSING");
    expect(res.attempts).toEqual([{ accountId: "eps", result: "NO_ROW" }]);
  });
});

describe("resolveDividendPayoutFallback — 현금배당금총액(idx4) ÷ (연결)당기순이익(idx1) × 100", () => {
  it("카카오 FY2023 — 순이익 음수(-1,012,551백만원) → NA_NEGATIVE_BASE", () => {
    const env = alot(CORP.카카오);
    const res = resolveDividendPayoutFallback(env, "lwfr", "CFS", false);
    expect(res.displayState).toBe("NA_NEGATIVE_BASE");
    expect(res.normalized).toBeNull();
  });

  it("카카오 FY2024 — 순이익 55,277백만원 · 배당총액 29,857백만원 → 54.01%", () => {
    const env = alot(CORP.카카오);
    const res = resolveDividendPayoutFallback(env, "frmtrm", "CFS", false);
    expect(res.displayState).toBe("OK");
    expect(res.normalized).toBeCloseTo((29857 / 55277) * 100, 4);
  });

  it("헬릭스미스 — 순이익 음수라 전 연도 NA_NEGATIVE_BASE(무배당이지만 fallback 분모 자체가 음수)", () => {
    const env = alot(CORP.헬릭스미스);
    for (const column of ["thstrm", "frmtrm", "lwfr"] as const) {
      const res = resolveDividendPayoutFallback(env, column, "CFS", false);
      expect(res.displayState).toBe("NA_NEGATIVE_BASE");
    }
  });
});
