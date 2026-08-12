import { describe, expect, it } from "vitest";

import { ACNT_ALL_CANDIDATES } from "./catalog";
import { deriveFcf, deriveOperatingMargin, deriveQ4, deriveRoa } from "./derive";
import { resolveAcntAllField } from "./resolve";
import type { AcntAllBody } from "./resolve";
import { CORP, loadFixture } from "./test-support";

function candidate(key: string) {
  const c = ACNT_ALL_CANDIDATES.find((c) => c.key === key);
  if (!c) throw new Error(`candidate not found: ${key}`);
  return c;
}

function acntAll(corpCode: string, year: string, reprt: string, fs: "CFS" | "OFS") {
  return loadFixture<AcntAllBody>(`fnlttSinglAcntAll__${corpCode}__${year}__${reprt}__${fs}`);
}

describe("deriveQ4 — 4Q 역산 (#39)", () => {
  it("삼성전자 2024 4Q 매출 = 11011.thstrm_amount − 11014.thstrm_add_amount = 75,788,269,000,000", () => {
    const annualList = acntAll(CORP.삼성전자, "2024", "11011", "CFS").body.list ?? [];
    const q3List = acntAll(CORP.삼성전자, "2024", "11014", "CFS").body.list ?? [];

    const annual = resolveAcntAllField(candidate("revenue"), annualList, "thstrm_amount", "CFS", false);
    const q3 = resolveAcntAllField(candidate("revenue"), q3List, "thstrm_add_amount", "CFS", false);

    expect(annual.normalized).toBe(300870903000000);
    expect(q3.normalized).toBe(225082634000000);

    const q4 = deriveQ4("q4_revenue", annual, q3);
    expect(q4.normalized).toBe(75788269000000);
    expect(q4.displayState).toBe("OK");
    expect(q4.derivation).toBe("Q4 = 300,870,903,000,000 − 225,082,634,000,000");
  });

  it("선행 지표가 MISSING이면 Q4도 MISSING이다", () => {
    const missing = { metricKey: "revenue", attempts: [], fsDiv: "CFS" as const, fsDivFallbackApplied: false, normalized: null, displayState: "MISSING" as const, parserVersion: "t4.1" };
    const q4 = deriveQ4("q4_revenue", missing, missing);
    expect(q4.displayState).toBe("MISSING");
    expect(q4.normalized).toBeNull();
  });
});

describe("deriveRoa / deriveOperatingMargin / deriveFcf", () => {
  it("삼성전자 2024 ROA = 당기순이익 ÷ 자산총계 × 100", () => {
    const list = acntAll(CORP.삼성전자, "2024", "11011", "CFS").body.list ?? [];
    const netIncome = resolveAcntAllField(candidate("net_income"), list, "thstrm_amount", "CFS", false);
    const totalAssets = resolveAcntAllField(candidate("total_assets"), list, "thstrm_amount", "CFS", false);

    const roa = deriveRoa(netIncome, totalAssets);
    expect(roa.displayState).toBe("OK");
    expect(roa.normalized).toBeCloseTo((34451351000000 / 514531948000000) * 100, 6);
  });

  it("KB금융 2024 영업이익률 — revenue가 MISSING이므로 MISSING (NOT_IN_PROFILE 판정은 T7 소관)", () => {
    const list = acntAll(CORP.KB금융, "2024", "11011", "CFS").body.list ?? [];
    const operatingIncome = resolveAcntAllField(candidate("operating_income"), list, "thstrm_amount", "CFS", false);
    const revenue = resolveAcntAllField(candidate("revenue"), list, "thstrm_amount", "CFS", false);

    expect(operatingIncome.displayState).toBe("OK"); // KB는 영업이익 자체는 있음(ifrs-full_ProfitLossFromOperatingActivities)
    expect(revenue.displayState).toBe("MISSING");

    const margin = deriveOperatingMargin(operatingIncome, revenue);
    expect(margin.displayState).toBe("MISSING");
  });

  it("분모(자산총계)가 0 이하면 NA_NEGATIVE_BASE", () => {
    const netIncome = { metricKey: "net_income", attempts: [], fsDiv: "CFS" as const, fsDivFallbackApplied: false, normalized: 100, displayState: "OK" as const, parserVersion: "t4.1" };
    const totalAssets = { metricKey: "total_assets", attempts: [], fsDiv: "CFS" as const, fsDivFallbackApplied: false, normalized: -50, displayState: "OK" as const, parserVersion: "t4.1" };
    const roa = deriveRoa(netIncome, totalAssets);
    expect(roa.displayState).toBe("NA_NEGATIVE_BASE");
    expect(roa.normalized).toBeNull();
  });

  it("삼성전자 2024 FCF = 영업활동현금흐름 − CAPEX(유형자산 취득만)", () => {
    const list = acntAll(CORP.삼성전자, "2024", "11011", "CFS").body.list ?? [];
    const operatingCf = resolveAcntAllField(candidate("operating_cf"), list, "thstrm_amount", "CFS", false);
    const capex = resolveAcntAllField(candidate("capex"), list, "thstrm_amount", "CFS", false);

    expect(operatingCf.normalized).toBe(72982621000000);
    expect(capex.normalized).toBe(51406355000000); // ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities

    const fcf = deriveFcf(operatingCf, capex);
    expect(fcf.normalized).toBe(21576266000000);
    expect(fcf.displayState).toBe("OK");
  });
});
