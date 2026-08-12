import { describe, expect, it } from "vitest";

import { FIN_INSURANCE_EXTRA_CANDIDATES } from "./fin-insurance-catalog";
import { FIN_SECURITIES_EXTRA_CANDIDATES } from "./fin-securities-catalog";
import { resolveFinExtras } from "./resolveFinExtras";
import { resolveProfileExtras } from "./resolveProfileExtras";
import { CORP, SNAPSHOTS_DIR } from "./test-support";

describe("resolveFinExtras — T10 FIN_SECURITIES 손익 5종 (실측, 2024)", () => {
  it("삼성증권 — 순이자손익 6,681억 / 순수수료손익 9,485억 (전부 CIS에서 HIT)", () => {
    const { fsDiv, resolutions } = resolveFinExtras(SNAPSHOTS_DIR, CORP.삼성증권, "2024", FIN_SECURITIES_EXTRA_CANDIDATES);
    expect(fsDiv).toBe("CFS");
    expect(resolutions.net_interest_income.normalized).toBe(668147980003);
    expect(resolutions.net_interest_income.displayState).toBe("OK");
    expect(resolutions.net_interest_income.hit?.sjDiv).toBe("CIS");
    expect(resolutions.net_fee_income.normalized).toBe(948541876681);
    expect(resolutions.interest_revenue.normalized).toBe(1691960043439);
    expect(resolutions.fee_income_gross.normalized).toBe(1146627595048);
  });

  it("NH투자증권 — 동일 계정 ID로 순이자손익 8,018억 HIT (양준호 지적 — 동일 비즈니스, 계정 ID는 같다)", () => {
    const { resolutions } = resolveFinExtras(SNAPSHOTS_DIR, CORP.NH투자증권, "2024", FIN_SECURITIES_EXTRA_CANDIDATES);
    expect(resolutions.net_interest_income.normalized).toBe(801775000000);
    expect(resolutions.net_fee_income.normalized).toBe(954676000000);
    expect(resolutions.other_operating_result.normalized).toBe(207577000000);
  });

  it("신영증권 — 순액(net) 계정 3종은 NO_ROW(MISSING), 총액 2종은 HIT (실제 계정명 편차)", () => {
    const { resolutions } = resolveFinExtras(SNAPSHOTS_DIR, CORP.신영증권, "2024", FIN_SECURITIES_EXTRA_CANDIDATES);
    for (const key of ["net_interest_income", "net_fee_income", "other_operating_result"]) {
      expect(resolutions[key].displayState, key).toBe("MISSING");
    }
    expect(resolutions.interest_revenue.displayState).toBe("OK");
    expect(resolutions.interest_revenue.normalized).toBe(321899677873);
    expect(resolutions.fee_income_gross.displayState).toBe("OK");
    expect(resolutions.fee_income_gross.normalized).toBe(151195054600);
  });
});

describe("resolveFinExtras — T10 FIN_INSURANCE 손익 5종 (실측, 2024)", () => {
  it("삼성생명 — 보험손익 5,366억 · 투자손익 1조9,631억 (생보 계정 ifrs-full_InsuranceServiceResult)", () => {
    const { resolutions } = resolveFinExtras(SNAPSHOTS_DIR, CORP.삼성생명, "2024", FIN_INSURANCE_EXTRA_CANDIDATES);
    expect(resolutions.insurance_result.normalized).toBe(536631000000);
    expect(resolutions.insurance_result.hit?.accountId).toBe("ifrs-full_InsuranceServiceResult");
    expect(resolutions.investment_result.normalized).toBe(1963120000000);
    expect(resolutions.insurance_revenue_gross.normalized).toBe(9190107000000);
  });

  it("DB손해보험 — 동일 account_id로 보험손익 1조7,192억 HIT (생보 vs 손보, 계정 ID는 같다)", () => {
    const { resolutions } = resolveFinExtras(SNAPSHOTS_DIR, CORP.DB손해보험, "2024", FIN_INSURANCE_EXTRA_CANDIDATES);
    expect(resolutions.insurance_result.normalized).toBe(1719189378646);
    expect(resolutions.investment_result.normalized).toBe(705736225311);
    expect(resolutions.insurance_expense_gross.normalized).toBe(14358986458941);
  });

  it("삼성전자 2024 — 보험/증권 전용 계정이라 전부 NO_ROW(MISSING) — 비금융 종목엔 존재하지 않는다", () => {
    const { resolutions } = resolveFinExtras(SNAPSHOTS_DIR, CORP.삼성전자, "2024", FIN_INSURANCE_EXTRA_CANDIDATES);
    for (const key of Object.keys(resolutions)) {
      expect(resolutions[key].displayState, key).toBe("MISSING");
    }
  });
});

describe("resolveProfileExtras — 프로필→카탈로그 디스패치", () => {
  it("STANDARD는 후보가 없어 빈 결과를 즉시 반환한다(파일 I/O 없이)", () => {
    const result = resolveProfileExtras(SNAPSHOTS_DIR, "STANDARD", CORP.삼성전자, "2024");
    expect(result.resolutions).toEqual({});
  });

  it("FIN_SECURITIES 프로필로 조회하면 fin-securities-catalog 후보가 그대로 해석된다", () => {
    const result = resolveProfileExtras(SNAPSHOTS_DIR, "FIN_SECURITIES", CORP.삼성증권, "2024");
    expect(result.resolutions.net_interest_income?.normalized).toBe(668147980003);
  });

  it("FIN_INSURANCE 프로필로 조회하면 fin-insurance-catalog 후보가 그대로 해석된다", () => {
    const result = resolveProfileExtras(SNAPSHOTS_DIR, "FIN_INSURANCE", CORP.삼성생명, "2024");
    expect(result.resolutions.insurance_result?.normalized).toBe(536631000000);
  });
});
