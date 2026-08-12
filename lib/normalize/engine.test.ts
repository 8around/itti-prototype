import { describe, expect, it } from "vitest";

import { resolveStock, resolveStockYear, YEARS } from "./engine";
import { CORP, SNAPSHOTS_DIR } from "./test-support";

describe("engine — 종목×연도 오케스트레이션 (실제 스냅샷 전체 사용)", () => {
  it("신영증권 FY2023 — CFS/OFS 둘 다 013 → 해당 연도 전체 MISSING", () => {
    const y = resolveStockYear(SNAPSHOTS_DIR, { stockCode: "001720", corpCode: CORP.신영증권, name: "신영증권" }, "2023");
    expect(y.resolutions.revenue.displayState).toBe("MISSING");
    expect(y.resolutions.total_assets.displayState).toBe("MISSING");
    expect(y.resolutions.eps_basic.displayState).toBe("MISSING");
  });

  it("신영증권 FY2024 — CFS 정상 복구 (같은 종목, 다른 연도는 정상)", () => {
    const y = resolveStockYear(SNAPSHOTS_DIR, { stockCode: "001720", corpCode: CORP.신영증권, name: "신영증권" }, "2024");
    expect(y.resolutions.revenue.displayState).toBe("OK");
    expect(y.fsDiv).toBe("CFS");
  });

  it("헬릭스미스 FY2024 — MISSING이 아니라 ZERO_BY_FACT로 명확히 구분된다(무배당 확인)", () => {
    const y = resolveStockYear(SNAPSHOTS_DIR, { stockCode: "084990", corpCode: CORP.헬릭스미스, name: "헬릭스미스" }, "2024");
    expect(y.resolutions.dps_common.displayState).toBe("ZERO_BY_FACT");
    expect(y.resolutions.dps_common.displayState).not.toBe("MISSING");
    expect(y.resolutions.dps_common.normalized).toBe(0);
    // EPS는 실제로 값이 있으므로 (MISSING이 아니라) OK여야 한다 — 같은 종목 안에서도 지표별로 갈린다.
    expect(y.resolutions.eps_basic.displayState).toBe("OK");
  });

  it("앱클론 전체 — fsDivFallbackApplied가 연도 단위로 모든 AcntAll 계열 지표에 전파된다", () => {
    const y = resolveStockYear(SNAPSHOTS_DIR, { stockCode: "174900", corpCode: CORP.앱클론, name: "앱클론" }, "2024");
    expect(y.fsDiv).toBe("OFS");
    expect(y.fsDivFallbackApplied).toBe(true);
    expect(y.resolutions.revenue.fsDivFallbackApplied).toBe(true);
    expect(y.resolutions.capex.fsDivFallbackApplied).toBe(true);
  });

  it("resolveStock — 3개년 전부 채워지고 커버리지가 산출된다", () => {
    const stock = resolveStock(SNAPSHOTS_DIR, { stockCode: "005930", corpCode: CORP.삼성전자, name: "삼성전자" });
    expect(stock.years.map((y) => y.year)).toEqual([...YEARS]);
    expect(stock.coverage.candidates).toBeGreaterThan(0);
    expect(stock.coverage.hit).toBeGreaterThan(0);
    expect(stock.coverage.hit).toBeLessThanOrEqual(stock.coverage.candidates);
    // 삼성전자는 데이터 품질이 가장 좋은 종목 — 커버리지가 90% 이상이어야 한다.
    expect(stock.coverage.hit / stock.coverage.candidates).toBeGreaterThan(0.9);
  });

  it("KB금융 — 매출 없는 금융업이라 삼성전자보다 커버리지가 낮다", () => {
    const kb = resolveStock(SNAPSHOTS_DIR, { stockCode: "105560", corpCode: CORP.KB금융, name: "KB금융" });
    const samsung = resolveStock(SNAPSHOTS_DIR, { stockCode: "005930", corpCode: CORP.삼성전자, name: "삼성전자" });
    expect(kb.coverage.hit / kb.coverage.candidates).toBeLessThan(samsung.coverage.hit / samsung.coverage.candidates);
  });
});
