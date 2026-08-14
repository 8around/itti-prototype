import { describe, expect, it } from "vitest";

import { deriveBps, deriveFcf, deriveGrowth, deriveInterestCoverage, deriveNetDebt, deriveNetIncomeAttributableFallback } from "./derive";
import type { Resolution } from "./types";

/** 파생 함수는 Resolution만 입력으로 받으므로 스냅샷 없이 최소 픽스처로 검증한다. */
function res(metricKey: string, normalized: number | null, hit?: { accountId: string; accountNm: string }): Resolution {
  return {
    metricKey,
    attempts: [],
    hit: hit ? { ...hit, sjDiv: "IS", rawValue: String(normalized), ord: 1 } : undefined,
    fsDiv: "CFS",
    fsDivFallbackApplied: false,
    normalized,
    displayState: normalized === null ? "MISSING" : "OK",
    parserVersion: "t4.1",
  };
}

describe("deriveBps — 주당순자산", () => {
  it("지배주주지분 ÷ 발행주식총수. 삼성전자 2024 실측 391,687,603,000,000 ÷ 6,792,669,250주 ≒ 57,663원", () => {
    const bps = deriveBps(res("equity_attributable_to_owners", 391687603000000), res("shares_outstanding", 6792669250));
    expect(bps.displayState).toBe("OK");
    expect(Math.round(bps.normalized!)).toBe(57663);
  });

  it("자본이 잠식(음수)이면 N/A — 근거 없는 음수 BPS를 만들지 않는다", () => {
    const bps = deriveBps(res("equity_attributable_to_owners", 391687603000000), res("shares_outstanding", 0));
    expect(bps.displayState).toBe("NA_NEGATIVE_BASE");
    expect(bps.normalized).toBeNull();
  });
});

describe("deriveInterestCoverage — 이자보상배율", () => {
  it("영업이익 ÷ 이자비용. 분모로 쓴 계정을 derivation에 남긴다(금융비용 폴백 여부가 해석을 바꾸므로)", () => {
    const coverage = deriveInterestCoverage(
      res("operating_income", 32725961000000),
      res("interest_expense", 12985684000000, { accountId: "ifrs-full_FinanceCosts", accountNm: "금융비용" }),
    );
    expect(coverage.displayState).toBe("OK");
    expect(coverage.normalized).toBeCloseTo(2.52, 2);
    expect(coverage.derivation).toContain("ifrs-full_FinanceCosts");
    expect(coverage.derivation).toContain("금융비용");
  });

  it("영업손실이면 음수 배율이 그대로 나온다 — 적자 사실을 숨기지 않는다", () => {
    const coverage = deriveInterestCoverage(res("operating_income", -17961000000), res("interest_expense", 4045049498));
    expect(coverage.displayState).toBe("OK");
    expect(coverage.normalized!).toBeLessThan(0);
  });

  it("이자비용이 0이면 배율 정의가 불가하므로 N/A + 사유를 남긴다", () => {
    const coverage = deriveInterestCoverage(res("operating_income", 1000), res("interest_expense", 0));
    expect(coverage.displayState).toBe("NA_NEGATIVE_BASE");
    expect(coverage.derivation).toContain("정의 불가");
  });
});

describe("deriveNetDebt — 순차입금(합산형)", () => {
  const cash = [res("cash_and_equivalents", 53705579000000), res("short_term_investments", 58909334000000)];

  it("여러 차입 계정을 전부 더한 뒤 현금성을 뺀다. 어떤 계정이 잡혔는지 derivation에 전부 남긴다", () => {
    const borrowings = [
      { accountId: "ifrs-full_ShorttermBorrowings", accountNm: "단기차입금", value: 1000000000000 },
      { accountId: "ifrs-full_NoncurrentPortionOfNoncurrentLoansReceived", accountNm: "장기차입금", value: 3935860000000 },
    ];
    const netDebt = deriveNetDebt(borrowings, [], cash, res("total_assets", 1));
    expect(netDebt.normalized).toBe(1000000000000 + 3935860000000 - 53705579000000 - 58909334000000);
    expect(netDebt.derivation).toContain("단기차입금");
    expect(netDebt.derivation).toContain("장기차입금");
    expect(netDebt.derivation).toContain("총차입금 구성(2개)");
  });

  it("순현금(차입금 < 현금)이면 음수가 정상값이다", () => {
    const netDebt = deriveNetDebt([{ accountId: "ifrs-full_ShorttermBorrowings", accountNm: "단기차입금", value: 1 }], [], cash, res("total_assets", 1));
    expect(netDebt.displayState).toBe("OK");
    expect(netDebt.normalized!).toBeLessThan(0);
  });

  it("차입 계정이 하나도 안 잡히면 0이 아니라 MISSING — '무차입'과 '못 읽음'을 섞지 않는다", () => {
    const netDebt = deriveNetDebt([], [{ accountId: "ifrs-full_ShorttermBorrowings", sjDiv: "BS", result: "NO_ROW" }], cash, res("total_assets", 1));
    expect(netDebt.displayState).toBe("MISSING");
    expect(netDebt.normalized).toBeNull();
  });
});

describe("deriveNetIncomeAttributableFallback — 비지배지분이 없는 회사", () => {
  const missingAttr: Resolution = {
    metricKey: "net_income_attributable_to_owners",
    attempts: [
      { accountId: "ifrs-full_ProfitLossAttributableToOwnersOfParent", sjDiv: "IS", result: "NO_ROW" },
      { accountId: "ifrs-full_ProfitLossAttributableToOwnersOfParent", sjDiv: "CIS", result: "NO_ROW" },
    ],
    fsDiv: "CFS",
    fsDivFallbackApplied: false,
    normalized: null,
    displayState: "MISSING",
    parserVersion: "t4.1",
  };

  it("지배주주 행·비지배 행이 모두 없으면 총액을 채택하고 판정 근거를 남긴다 (신라젠 2024 실측 −26,525,745,518)", () => {
    const result = deriveNetIncomeAttributableFallback(missingAttr, res("net_income", -26525745518), false);
    expect(result.displayState).toBe("OK");
    expect(result.normalized).toBe(-26525745518);
    expect(result.derivation).toContain("비지배지분이 존재하지 않는 구조");
    // 왜 폴백했는지가 출처 패널에서 보이도록 원래 NO_ROW 시도 이력이 남아 있어야 한다.
    expect(result.attempts.filter((a) => a.result === "NO_ROW")).toHaveLength(2);
  });

  it("비지배 행이 있는데 지배주주 행만 없으면 폴백하지 않는다 — 총액에 남의 몫이 섞여 있다", () => {
    const result = deriveNetIncomeAttributableFallback(missingAttr, res("net_income", 515011000000), true);
    expect(result.displayState).toBe("MISSING");
    expect(result.normalized).toBeNull();
  });

  it("지배주주 행이 이미 있으면 그대로 통과시킨다", () => {
    const ok = res("net_income_attributable_to_owners", -690854000000);
    expect(deriveNetIncomeAttributableFallback(ok, res("net_income", 515011000000), false)).toBe(ok);
  });
});

describe("deriveGrowth — QoQ · YoY 성장률", () => {
  it("(당기 − 전기) ÷ |전기| × 100", () => {
    const growth = deriveGrowth("revenue_qoq", res("revenue", 200), res("revenue", 160), "1Q26 QoQ");
    expect(growth.displayState).toBe("OK");
    expect(growth.normalized).toBeCloseTo(25, 6);
  });

  it("전기가 적자였는데 당기 흑자면 %가 무의미 — 수치 대신 '흑자전환'을 남긴다(학습가이드 1Q26 케이스)", () => {
    const growth = deriveGrowth("operating_income_qoq", res("operating_income", 200), res("operating_income", -30), "1Q26 QoQ");
    expect(growth.displayState).toBe("NA_NEGATIVE_BASE");
    expect(growth.normalized).toBeNull();
    expect(growth.derivation).toContain("흑자전환");
  });

  it("흑자에서 적자로 돌아서면 '적자전환'", () => {
    const growth = deriveGrowth("operating_income_qoq", res("operating_income", -30), res("operating_income", 168), "4Q25 QoQ");
    expect(growth.displayState).toBe("NA_NEGATIVE_BASE");
    expect(growth.derivation).toContain("적자전환");
  });

  it("적자가 더 깊어지면 분모 절대값 덕분에 음수(악화)로 나온다 — 부호를 그대로 두면 +로 뒤집힌다", () => {
    const growth = deriveGrowth("operating_income_qoq", res("operating_income", -200), res("operating_income", -100), "QoQ");
    expect(growth.displayState).toBe("OK");
    expect(growth.normalized).toBeCloseTo(-100, 6);
  });

  it("전기가 0이면 증가율 정의가 불가하다", () => {
    const growth = deriveGrowth("revenue_qoq", res("revenue", 100), res("revenue", 0), "QoQ");
    expect(growth.displayState).toBe("NA_NEGATIVE_BASE");
    expect(growth.derivation).toContain("정의 불가");
  });

  it("입력 중 하나라도 결측이면 MISSING", () => {
    const growth = deriveGrowth("revenue_qoq", res("revenue", 100), res("revenue", null), "QoQ");
    expect(growth.displayState).toBe("MISSING");
  });
});

describe("deriveFcf — CAPEX 부호 규약 (회사마다 다름)", () => {
  it("CAPEX가 양수로 공시되면 그대로 뺀다 (삼성전자 2024: 영업 72.98조 − 51.41조)", () => {
    const fcf = deriveFcf(res("operating_cf", 72982000000000), res("capex", 51406355000000));
    expect(fcf.normalized).toBe(72982000000000 - 51406355000000);
    expect(fcf.derivation).not.toContain("음수 공시");
  });

  it("CAPEX가 음수로 공시돼도 유출로 빼야 한다 (LG화학 2024: 영업 7.01조 − |−14.61조| = −7.60조)", () => {
    const fcf = deriveFcf(res("operating_cf", 7005000000000), res("capex", -14608000000000));
    // 부호를 그대로 빼면 +21.61조가 되어 적자가 흑자로 뒤집힌다.
    expect(fcf.normalized).toBe(7005000000000 - 14608000000000);
    expect(fcf.normalized!).toBeLessThan(0);
    expect(fcf.derivation).toContain("음수 공시");
  });

  it("입력이 결측이면 MISSING", () => {
    expect(deriveFcf(res("operating_cf", null), res("capex", 1)).displayState).toBe("MISSING");
  });
});
