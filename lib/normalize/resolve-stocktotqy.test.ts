import { describe, expect, it } from "vitest";

import { STOCK_TOTQY_CANDIDATES } from "./catalog";
import { resolveStockTotqyMetric } from "./resolve-stocktotqy";
import type { StockTotqyBody } from "./resolve-stocktotqy";
import { CORP, loadFixture } from "./test-support";

function candidate(key: string) {
  const c = STOCK_TOTQY_CANDIDATES.find((c) => c.key === key);
  if (!c) throw new Error(`candidate not found: ${key}`);
  return c;
}

function stockTotqy(corpCode: string, year: string) {
  return loadFixture<StockTotqyBody>(`stockTotqySttus__${corpCode}__${year}__11011`);
}

describe('resolveStockTotqyMetric — se === "비고" 행 제외 (#27)', () => {
  it("삼성전자 2024 발행주식총수/자기주식수 — 합계 행에서 읽는다", () => {
    const env = stockTotqy(CORP.삼성전자, "2024");
    const shares = resolveStockTotqyMetric(candidate("shares_outstanding"), env, "CFS", false);
    const treasury = resolveStockTotqyMetric(candidate("treasury_shares"), env, "CFS", false);

    expect(shares.normalized).toBe(6792669250);
    expect(treasury.normalized).toBe(33750000);
    expect(shares.hit?.accountNm).toBe("합계");
  });

  it('"비고" 행의 한글 값이 숫자로 잘못 파싱되지 않는다', () => {
    const env = stockTotqy(CORP.삼성전자, "2024");
    const noteRow = env.body.list?.find((r) => r.se === "비고");
    expect(noteRow?.profit_incnr).toBe("자사주소각"); // (env 원본에 한글값 존재 확인)

    // "합계" 행이 정상 해석되고, "비고" 행이 결과에 영향을 주지 않는지 재확인.
    const res = resolveStockTotqyMetric(candidate("shares_outstanding"), env, "CFS", false);
    expect(res.normalized).not.toBeNaN();
    expect(res.displayState).toBe("OK");
  });

  it("envelope이 없으면 NO_ROW → MISSING", () => {
    const res = resolveStockTotqyMetric(candidate("shares_outstanding"), null, "CFS", false);
    expect(res.displayState).toBe("MISSING");
  });
});
