import { describe, expect, it } from "vitest";

import { SINGL_INDX_CANDIDATES } from "./catalog";
import { resolveIndxMetric } from "./resolve-indx";
import type { IndxBody } from "./resolve-indx";
import { CORP, loadFixture } from "./test-support";

function candidate(key: string) {
  const c = SINGL_INDX_CANDIDATES.find((c) => c.key === key);
  if (!c) throw new Error(`candidate not found: ${key}`);
  return c;
}

function indx(corpCode: string, year: string, idxClCode: string) {
  return loadFixture<IndxBody>(`fnlttSinglIndx__${corpCode}__${year}__11011__${idxClCode}`);
}

describe("resolveIndxMetric — fnlttSinglIndx", () => {
  it("삼성전자 2024 ROE(M211550) = 8.997", () => {
    const env = indx(CORP.삼성전자, "2024", "M210000");
    const res = resolveIndxMetric(candidate("roe"), env, "CFS", false);
    expect(res.normalized).toBe(8.997);
    expect(res.displayState).toBe("OK");
  });

  it("삼성전자 2024 부채비율(M221100) = 27.932", () => {
    const env = indx(CORP.삼성전자, "2024", "M220000");
    const res = resolveIndxMetric(candidate("debt_ratio"), env, "CFS", false);
    expect(res.normalized).toBe(27.932);
  });

  it('카카오 배당성향(M451000, M240000) — FY2024 -26.858 정상 수신(적자여도 음수로 정상 반환, "화면 방어" 대상)', () => {
    // 브리프 표는 이 값을 FY2023으로 적었으나 실측은 FY2024(bsns_year=2024) 값이다.
    // FY2023은 idx_val 키 자체가 없다(아래 테스트) — task-T4-report.md "불일치" 참조.
    const env = indx(CORP.카카오, "2024", "M240000");
    const res = resolveIndxMetric(candidate("dividend_payout_indx"), env, "CFS", false);
    expect(res.normalized).toBe(-26.858);
    expect(res.displayState).toBe("OK");
  });

  it("카카오 배당성향 FY2023 — idx_code 행은 있으나 idx_val 키 자체가 없음(#40) → EMPTY_VALUE → MISSING", () => {
    const env = indx(CORP.카카오, "2023", "M240000");
    const row = env.body.list?.find((r) => r.idx_code === "M451000");
    expect(row).toBeDefined();
    expect(row?.idx_val).toBeUndefined();

    const res = resolveIndxMetric(candidate("dividend_payout_indx"), env, "CFS", false);
    expect(res.attempts).toEqual([{ accountId: "M451000", result: "EMPTY_VALUE" }]);
    expect(res.displayState).toBe("MISSING");
  });

  it('삼성전자 M242000(자본금회전율) "#########" 오버플로 마커 → null (#41)', () => {
    const env = indx(CORP.삼성전자, "2024", "M240000");
    const row = env.body.list?.find((r) => r.idx_code === "M242000");
    expect(row?.idx_val).toBe("#########");

    const fakeCandidate = { ...candidate("roe"), key: "capital_turnover", accountIds: ["M242000"] };
    const res = resolveIndxMetric(fakeCandidate, env, "CFS", false);
    expect(res.normalized).toBeNull();
    expect(res.attempts[0].result).toBe("EMPTY_VALUE");
  });

  it("envelope이 null이면 NO_ROW → MISSING", () => {
    const res = resolveIndxMetric(candidate("roe"), null, "CFS", false);
    expect(res.displayState).toBe("MISSING");
    expect(res.attempts).toEqual([{ accountId: "M211550", result: "NO_ROW" }]);
  });
});
