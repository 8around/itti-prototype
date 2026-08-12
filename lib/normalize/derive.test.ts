import { describe, expect, it } from "vitest";

import { ACNT_ALL_CANDIDATES } from "./catalog";
import { deriveFcf, deriveOperatingMargin, deriveQ4, deriveQoQ, deriveQuarterCf, deriveRoa, deriveYoY, missingResolution } from "./derive";
import { resolveAcntAllField } from "./resolve";
import type { AcntAllBody } from "./resolve";
import type { Resolution } from "./types";
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

/** v2 T2 — 순수 함수 단위 테스트(스냅샷 불필요). 정수 리터럴로 4개 분기 부호 조합 경계를 고정한다. */
function res(normalized: number | null, displayState: Resolution["displayState"] = "OK"): Resolution {
  return { metricKey: "x", attempts: [], fsDiv: "CFS", fsDivFallbackApplied: false, normalized, displayState, parserVersion: "test" };
}

describe("deriveQuarterCf — CF 분기 단일화(Q2~Q4 차분, T1V 판정2)", () => {
  it("당기 누적 − 직전 누적, derivation 라벨을 그대로 반영한다", () => {
    const current = res(28761716000000); // 11012(반기) 누적
    const prior = res(11866306000000); // 11013(1분기) 누적
    const q2 = deriveQuarterCf("operating_cf", "Q2(CF)", current, prior);
    expect(q2.displayState).toBe("OK");
    expect(q2.normalized).toBe(16895410000000);
    expect(q2.derivation).toBe("Q2(CF) = 28,761,716,000,000 − 11,866,306,000,000");
  });

  it("피연산자 중 하나라도 MISSING이면 MISSING(0 채우기 금지)", () => {
    const q = deriveQuarterCf("operating_cf", "Q3(CF)", res(null, "MISSING"), res(11866306000000));
    expect(q.displayState).toBe("MISSING");
    expect(q.normalized).toBeNull();
  });
});

describe("deriveQoQ/deriveYoY — 4분면 + MISSING (팀리드 브리프 승인 규칙)", () => {
  it("직전>0, 당기>0 — 정상 %", () => {
    const r = deriveQoQ("qoq_revenue", res(110), res(100));
    expect(r.displayState).toBe("OK");
    expect(r.normalized).toBeCloseTo(10, 6);
  });

  it("직전≤0, 당기>0 — TURN_TO_PROFIT(흑자전환), 수치는 숨긴다", () => {
    const r = deriveYoY("yoy_operating_income", res(50), res(-30));
    expect(r.displayState).toBe("TURN_TO_PROFIT");
    expect(r.normalized).toBeNull();
    expect(r.derivation).toContain("흑자전환");
  });

  it("직전>0, 당기≤0 — TURN_TO_LOSS(적자전환)", () => {
    const r = deriveQoQ("qoq_net_income_attributable_to_owners", res(-10), res(20));
    expect(r.displayState).toBe("TURN_TO_LOSS");
    expect(r.normalized).toBeNull();
  });

  it("직전≤0, 당기≤0 — LOSS_CONTINUED(적자지속)", () => {
    const r = deriveYoY("yoy_operating_income", res(-5), res(-20));
    expect(r.displayState).toBe("LOSS_CONTINUED");
    expect(r.normalized).toBeNull();
  });

  it("직전=0, 당기=0 — 경계값도 LOSS_CONTINUED(0은 '이익'이 아니라 '흑자 아님'으로 취급)", () => {
    const r = deriveQoQ("qoq_revenue", res(0), res(0));
    expect(r.displayState).toBe("LOSS_CONTINUED");
  });

  it("한쪽이 MISSING이면 growth도 MISSING", () => {
    const r = deriveQoQ("qoq_revenue", res(null, "MISSING"), res(100));
    expect(r.displayState).toBe("MISSING");
  });
});

describe("missingResolution — 비교 대상 분기가 데이터셋 밖일 때의 자리표시", () => {
  it("normalized null / MISSING / like의 fsDiv를 그대로 물려받는다", () => {
    const like = res(100);
    const m = missingResolution("qoq_revenue", like);
    expect(m.normalized).toBeNull();
    expect(m.displayState).toBe("MISSING");
    expect(m.fsDiv).toBe(like.fsDiv);
  });
});
