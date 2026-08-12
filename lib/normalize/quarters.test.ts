import { describe, expect, it } from "vitest";

import { ACNT_ALL_CANDIDATES } from "./catalog";
import { buildQuarterSeries, lastN } from "./quarters";
import type { LoadAcntAll } from "./quarters";
import type { AcntAllBody } from "./resolve";

/**
 * 단일분기 시계열 빌더 검증.
 *
 * 실측 근거(삼성전자 2025 CFS `ifrs-full_Revenue`, public/snapshots):
 *   11013 thstrm_amount 79,140,503,000,000 / add 동일
 *   11012 thstrm_amount 74,566,317,000,000 / add 153,706,820,000,000
 *   11014 thstrm_amount 86,061,747,000,000 / add 239,768,567,000,000
 *   11011 thstrm_amount 333,605,938,000,000 / add ""(없음)
 * → Q4 역산 = 333,605,938 − 239,768,567 = 93,837,371 (백만원 단위 표기)
 */

const REVENUE = ACNT_ALL_CANDIDATES.find((c) => c.key === "revenue")!;

function body(rows: { amount?: string; add?: string }): AcntAllBody {
  return {
    status: "000",
    message: "정상",
    list: [
      {
        account_id: "ifrs-full_Revenue",
        account_nm: "매출액",
        account_detail: "-",
        sj_div: "IS",
        ord: "1",
        thstrm_amount: rows.amount,
        thstrm_add_amount: rows.add,
      },
    ],
  };
}

const SAMSUNG_2025: Record<string, AcntAllBody> = {
  "11013": body({ amount: "79140503000000", add: "79140503000000" }),
  "11012": body({ amount: "74566317000000", add: "153706820000000" }),
  "11014": body({ amount: "86061747000000", add: "239768567000000" }),
  "11011": body({ amount: "333605938000000", add: "" }),
};

const loadSamsung2025: LoadAcntAll = (year, reprtCode) => (year === "2025" ? (SAMSUNG_2025[reprtCode] ?? null) : null);

describe("buildQuarterSeries — 단일분기 시계열", () => {
  it("Q1~Q3는 thstrm_amount(단일분기 공시값)를 그대로 쓰고 역산하지 않는다", () => {
    const points = buildQuarterSeries(REVENUE, { from: { year: "2025", quarter: 1 }, to: { year: "2025", quarter: 3 } }, loadSamsung2025, "CFS", false);
    expect(points.map((p) => p.resolution.normalized)).toEqual([79140503000000, 74566317000000, 86061747000000]);
    expect(points.every((p) => p.provisional === false)).toBe(true);
  });

  it("Q4는 연간 − 3Q누적으로 역산하고 provisional로 표시한다 (#39)", () => {
    const points = buildQuarterSeries(REVENUE, { from: { year: "2025", quarter: 4 }, to: { year: "2025", quarter: 4 } }, loadSamsung2025, "CFS", false);
    expect(points[0].resolution.normalized).toBe(333605938000000 - 239768567000000);
    expect(points[0].provisional).toBe(true);
    expect(points[0].resolution.derivation).toContain("Q4 =");
  });

  it("단일분기 공시값과 누적 차분이 어긋나면 공시값을 채택하되 derivation에 경고를 남긴다", () => {
    const inconsistent: LoadAcntAll = (year, reprtCode) => {
      if (year !== "2025") return null;
      // 반기 단일분기 값만 1조 부풀린 가상 케이스 — 누적(153.7조)과 어긋난다.
      if (reprtCode === "11012") return body({ amount: "75566317000000", add: "153706820000000" });
      return SAMSUNG_2025[reprtCode] ?? null;
    };
    const points = buildQuarterSeries(REVENUE, { from: { year: "2025", quarter: 2 }, to: { year: "2025", quarter: 2 } }, inconsistent, "CFS", false);
    expect(points[0].resolution.normalized).toBe(75566317000000);
    expect(points[0].resolution.derivation).toContain("불일치");
  });

  it("보고서가 없는 분기는 근거 없는 0이 아니라 MISSING으로 자리를 남긴다", () => {
    const points = buildQuarterSeries(REVENUE, { from: { year: "2026", quarter: 1 }, to: { year: "2026", quarter: 2 } }, loadSamsung2025, "CFS", false);
    expect(points).toHaveLength(2);
    expect(points.every((p) => p.resolution.displayState === "MISSING" && p.resolution.normalized === null)).toBe(true);
  });

  it("연도를 넘어가는 구간도 Q4 → 다음해 Q1로 이어진다", () => {
    const points = buildQuarterSeries(REVENUE, { from: { year: "2025", quarter: 3 }, to: { year: "2026", quarter: 1 } }, loadSamsung2025, "CFS", false);
    expect(points.map((p) => p.label)).toEqual(["25.3Q", "25.4Q", "26.1Q"]);
  });
});

describe("lastN", () => {
  it("길이가 모자라면 있는 만큼만 돌려준다", () => {
    expect(lastN([1, 2, 3], 5)).toEqual([1, 2, 3]);
    expect(lastN([1, 2, 3, 4, 5, 6], 5)).toEqual([2, 3, 4, 5, 6]);
  });
});
