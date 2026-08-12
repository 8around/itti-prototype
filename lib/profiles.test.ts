import { describe, expect, it } from "vitest";

import { pnlKeysOnlyIn, resolveDisplay, summarizePnlCoverage, toProfileId, withDisplayState } from "./profiles";
import type { Resolution } from "./normalize/types";

function ok(metricKey: string, normalized = 1): Resolution {
  return { metricKey, attempts: [], fsDiv: "CFS", fsDivFallbackApplied: false, normalized, displayState: "OK", parserVersion: "t4.1" };
}

function missing(metricKey: string): Resolution {
  return {
    metricKey,
    attempts: [
      { accountId: "ifrs-full_Revenue", sjDiv: "IS", result: "NO_ROW" },
      { accountId: "ifrs-full_Revenue", sjDiv: "CIS", result: "NO_ROW" },
    ],
    fsDiv: "CFS",
    fsDivFallbackApplied: false,
    normalized: null,
    displayState: "MISSING",
    parserVersion: "t4.1",
  };
}

describe("resolveDisplay — T7 프로필 판정", () => {
  it("카탈로그에 없는 지표는 NOT_IN_PROFILE (KB금융 화면에서 매출액을 물으면)", () => {
    expect(resolveDisplay("FIN_HOLDING", "revenue", missing("revenue"))).toBe("NOT_IN_PROFILE");
    expect(resolveDisplay("FIN_HOLDING", "gross_profit", missing("gross_profit"))).toBe("NOT_IN_PROFILE");
    expect(resolveDisplay("FIN_HOLDING", "operating_margin", missing("operating_margin"))).toBe("NOT_IN_PROFILE");
  });

  it("sourceAvailable:false 지표는 Resolution 유무와 무관하게 SOURCE_NOT_AVAILABLE (BIS·NPL)", () => {
    expect(resolveDisplay("FIN_HOLDING", "bis_ratio", undefined)).toBe("SOURCE_NOT_AVAILABLE");
    expect(resolveDisplay("FIN_HOLDING", "npl_ratio", ok("npl_ratio"))).toBe("SOURCE_NOT_AVAILABLE");
  });

  it("카탈로그에 있고 sourceAvailable:true면 T4 displayState를 그대로 통과시킨다", () => {
    expect(resolveDisplay("FIN_HOLDING", "net_interest_income", ok("net_interest_income", 12826714000000))).toBe("OK");
    expect(resolveDisplay("STANDARD", "revenue", ok("revenue", 300870903000000))).toBe("OK");
  });

  it("공유 후보(operating_income/net_income)는 두 프로필 모두에서 OK — NOT_IN_PROFILE이 아니다", () => {
    expect(resolveDisplay("STANDARD", "operating_income", ok("operating_income"))).toBe("OK");
    expect(resolveDisplay("FIN_HOLDING", "operating_income", ok("operating_income"))).toBe("OK");
  });
});

describe("withDisplayState — SourcePanel 폴백 탭 일관성", () => {
  it("attempts/hit은 유지한 채 displayState만 덮어쓴다", () => {
    const original = missing("revenue");
    const overridden = withDisplayState(original, "NOT_IN_PROFILE");
    expect(overridden.displayState).toBe("NOT_IN_PROFILE");
    expect(overridden.attempts).toEqual(original.attempts);
    expect(overridden.attempts).toHaveLength(2);
    expect(overridden.attempts[0]).toEqual({ accountId: "ifrs-full_Revenue", sjDiv: "IS", result: "NO_ROW" });
    expect(overridden.attempts[1]).toEqual({ accountId: "ifrs-full_Revenue", sjDiv: "CIS", result: "NO_ROW" });
  });
});

describe("summarizePnlCoverage — 하드코딩 없는 후보 N/M 집계", () => {
  it("STANDARD: 후보 4개(operating_margin 제외) 중 4개 존재", () => {
    const resolutions: Record<string, Resolution> = {
      revenue: ok("revenue"),
      gross_profit: ok("gross_profit"),
      operating_income: ok("operating_income"),
      net_income: ok("net_income"),
      operating_margin: ok("operating_margin"),
    };
    const coverage = summarizePnlCoverage("STANDARD", resolutions);
    expect(coverage.total).toBe(4);
    expect(coverage.hit).toBe(4);
    expect(coverage.missing).toEqual([]);
  });

  it("FIN_HOLDING: KB금융처럼 8개 후보가 전부 실측 HIT이면 8/8 (하드코딩된 5/3이 아니라 실측대로)", () => {
    const resolutions: Record<string, Resolution> = {
      net_interest_income: ok("net_interest_income"),
      net_fee_income: ok("net_fee_income"),
      insurance_result: ok("insurance_result"),
      credit_loss_allowance: ok("credit_loss_allowance"),
      interest_revenue: ok("interest_revenue"),
      insurance_revenue: ok("insurance_revenue"),
      operating_income: ok("operating_income"),
      net_income: ok("net_income"),
    };
    const coverage = summarizePnlCoverage("FIN_HOLDING", resolutions);
    expect(coverage.total).toBe(8);
    expect(coverage.hit).toBe(8);
  });

  it("일부만 존재하면 missing에 사유(state)와 함께 정확히 담긴다", () => {
    const resolutions: Record<string, Resolution> = {
      net_interest_income: ok("net_interest_income"),
      net_fee_income: missing("net_fee_income"),
      // insurance_result·credit_loss_allowance·interest_revenue·insurance_revenue·operating_income·net_income 없음
    };
    const coverage = summarizePnlCoverage("FIN_HOLDING", resolutions);
    expect(coverage.total).toBe(8);
    expect(coverage.hit).toBe(1);
    expect(coverage.missing).toHaveLength(7);
    expect(coverage.missing.find((m) => m.key === "net_fee_income")?.state).toBe("MISSING");
  });
});

describe("pnlKeysOnlyIn — 프로필 간 후보 차집합 (화면 하드코딩 없이 '해당 없음' 목록 계산)", () => {
  it("STANDARD에만 있고 FIN_HOLDING엔 없는 키 = revenue/gross_profit/operating_margin", () => {
    const onlyStandard = pnlKeysOnlyIn("STANDARD", "FIN_HOLDING");
    expect(new Set(onlyStandard)).toEqual(new Set(["revenue", "gross_profit", "operating_margin"]));
  });

  it("FIN_HOLDING에만 있고 STANDARD엔 없는 키 = 금융 6종 (operating_income/net_income은 공유되므로 제외)", () => {
    const onlyFinHolding = pnlKeysOnlyIn("FIN_HOLDING", "STANDARD");
    expect(new Set(onlyFinHolding)).toEqual(
      new Set(["net_interest_income", "net_fee_income", "insurance_result", "credit_loss_allowance", "interest_revenue", "insurance_revenue"]),
    );
  });
});

describe("toProfileId — universe.json 어휘(NON_FIN 등) → ProfileId 매핑", () => {
  it("NON_FIN은 STANDARD로 매핑된다(어휘가 다르다 — T2 이월 노트)", () => {
    expect(toProfileId("NON_FIN")).toBe("STANDARD");
    expect(toProfileId("FIN_HOLDING")).toBe("FIN_HOLDING");
  });

  it("알 수 없는 값은 에러를 던진다", () => {
    expect(() => toProfileId("UNKNOWN")).toThrow();
  });
});
