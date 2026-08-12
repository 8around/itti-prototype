import { describe, expect, it } from "vitest";

import { CORP, SNAPSHOTS_DIR } from "./test-support";
import { resolveFinHoldingExtras } from "./resolveFinHoldingExtras";

describe("resolveFinHoldingExtras — T7 FIN_HOLDING 손익 6종 (실측)", () => {
  it("KB금융 2024 — 순이자손익 12.83조 / 순수수료손익 3.85조 (브리프 완료판정 수치와 일치)", () => {
    const { fsDiv, fsDivFallbackApplied, resolutions } = resolveFinHoldingExtras(SNAPSHOTS_DIR, CORP.KB금융, "2024");

    expect(fsDiv).toBe("CFS");
    expect(fsDivFallbackApplied).toBe(false);

    expect(resolutions.net_interest_income.normalized).toBe(12826714000000);
    expect(resolutions.net_interest_income.displayState).toBe("OK");
    expect(resolutions.net_interest_income.hit?.accountId).toBe("ifrs-full_InterestRevenueExpense");
    expect(resolutions.net_interest_income.hit?.sjDiv).toBe("CIS");

    expect(resolutions.net_fee_income.normalized).toBe(3849627000000);
    expect(resolutions.net_fee_income.displayState).toBe("OK");
  });

  it("KB금융 2024 — 후보 6개 전부 IS에서는 NO_ROW, CIS에서 HIT (금융지주는 CIS만 작성)", () => {
    const { resolutions } = resolveFinHoldingExtras(SNAPSHOTS_DIR, CORP.KB금융, "2024");
    for (const key of ["net_interest_income", "interest_revenue", "net_fee_income", "insurance_result", "insurance_revenue", "credit_loss_allowance"]) {
      const r = resolutions[key];
      expect(r.displayState, `${key} displayState`).toBe("OK");
      expect(r.attempts, `${key} attempts`).toEqual([
        { accountId: r.attempts[0].accountId, sjDiv: "IS", result: "NO_ROW" },
        { accountId: r.attempts[0].accountId, sjDiv: "CIS", result: "HIT" },
      ]);
    }
  });

  it("삼성전자 2024 — 금융업 전용 계정이라 6개 전부 NO_ROW(MISSING) — 비금융 종목엔 존재하지 않는다", () => {
    const { resolutions } = resolveFinHoldingExtras(SNAPSHOTS_DIR, CORP.삼성전자, "2024");
    for (const key of ["net_interest_income", "interest_revenue", "net_fee_income", "insurance_result", "insurance_revenue", "credit_loss_allowance"]) {
      expect(resolutions[key].displayState, key).toBe("MISSING");
      expect(resolutions[key].normalized, key).toBeNull();
    }
  });
});
