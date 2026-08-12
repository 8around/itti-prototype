import { describe, expect, it } from "vitest";

import { ACNT_ALL_CANDIDATES } from "./catalog";
import { resolveAcntAllField, resolveFsDiv } from "./resolve";
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

describe("resolveAcntAllField — fnlttSinglAcntAll 폴백 체인", () => {
  it("삼성전자 2024 매출액 — 1차 시도로 HIT (300,870,903,000,000)", () => {
    const env = acntAll(CORP.삼성전자, "2024", "11011", "CFS");
    const res = resolveAcntAllField(candidate("revenue"), env.body.list ?? [], "thstrm_amount", "CFS", false);

    expect(res.normalized).toBe(300870903000000);
    expect(res.displayState).toBe("OK");
    expect(res.hit).toMatchObject({ accountId: "ifrs-full_Revenue", sjDiv: "IS" });
    expect(res.attempts).toEqual([{ accountId: "ifrs-full_Revenue", sjDiv: "IS", result: "HIT" }]);
  });

  it("KB금융 2024 매출액 — 전 sjDiv(IS/CIS) NO_ROW → MISSING", () => {
    const env = acntAll(CORP.KB금융, "2024", "11011", "CFS");
    const res = resolveAcntAllField(candidate("revenue"), env.body.list ?? [], "thstrm_amount", "CFS", false);

    expect(res.normalized).toBeNull();
    expect(res.displayState).toBe("MISSING");
    expect(res.attempts).toEqual([
      { accountId: "ifrs-full_Revenue", sjDiv: "IS", result: "NO_ROW" },
      { accountId: "ifrs-full_Revenue", sjDiv: "CIS", result: "NO_ROW" },
    ]);
  });

  it("헬릭스미스 2024 EPS — 1차 BasicEarningsLossPerShare NO_ROW → 2차 …FromContinuingOperations HIT(-329)", () => {
    // 실측: 브리프 표는 이 값을 FY2023으로 적었으나 실제 스냅샷에서는 FY2024 thstrm 값이다.
    // 보고서(20250814003809)의 frmtrm(FY2023)이 -1544, bfefrmtrm(FY2022)이 -1156 — task-T4-report.md "불일치" 참조.
    const env = acntAll(CORP.헬릭스미스, "2024", "11011", "CFS");
    const res = resolveAcntAllField(candidate("eps_basic"), env.body.list ?? [], "thstrm_amount", "CFS", false);

    expect(res.normalized).toBe(-329);
    expect(res.displayState).toBe("OK");
    expect(res.hit?.accountId).toBe("ifrs-full_BasicEarningsLossPerShareFromContinuingOperations");
    expect(res.attempts.map((a) => a.result)).toEqual(["NO_ROW", "NO_ROW", "NO_ROW", "HIT"]);
  });

  it("카카오 손익 — IS 0행, CIS에서 HIT (sjDiv: CIS)", () => {
    const env = acntAll(CORP.카카오, "2024", "11011", "CFS");
    const list = env.body.list ?? [];
    expect(list.some((r) => r.sj_div === "IS")).toBe(false); // #32 — IS 0행 실측

    const res = resolveAcntAllField(candidate("net_income"), list, "thstrm_amount", "CFS", false);
    expect(res.hit?.sjDiv).toBe("CIS");
    expect(res.displayState).toBe("OK");
  });

  it("ifrs-full_ProfitLoss IS/CIS/CF 3중복(#35) — sjDivPriority상 IS를 골라 dedupe한다", () => {
    const env = acntAll(CORP.삼성전자, "2024", "11011", "CFS");
    const list = env.body.list ?? [];
    const dupRows = list.filter((r) => r.account_id === "ifrs-full_ProfitLoss" && r.account_detail === "-");
    expect(dupRows.map((r) => r.sj_div).sort()).toEqual(["CF", "CIS", "IS"]); // 실측 3중복 확인

    const res = resolveAcntAllField(candidate("net_income"), list, "thstrm_amount", "CFS", false);
    expect(res.hit?.sjDiv).toBe("IS");
    expect(res.normalized).toBe(34451351000000);
  });

  it('"", "-", "#########" 세 결측 표현이 전부 null(normalized)로 이어진다', () => {
    const list = [
      { account_id: "TEST_EMPTY", account_nm: "빈문자열", account_detail: "-", sj_div: "IS", ord: "1", thstrm_amount: "" },
    ];
    const c = { ...candidate("revenue"), accountIds: ["TEST_EMPTY"] };
    const res = resolveAcntAllField(c, list, "thstrm_amount", "CFS", false);
    expect(res.normalized).toBeNull();
    expect(res.attempts[0].result).toBe("EMPTY_VALUE");
  });
});

describe("resolveFsDiv — CFS→OFS 폴백 (#37)", () => {
  it("앱클론 2024 — CFS 013 → OFS 재시도, fsDivFallbackApplied=true", () => {
    const cfs = acntAll(CORP.앱클론, "2024", "11011", "CFS");
    expect(cfs.body.status).toBe("013");

    const result = resolveFsDiv(
      () => cfs,
      () => acntAll(CORP.앱클론, "2024", "11011", "OFS"),
    );

    expect(result.fsDiv).toBe("OFS");
    expect(result.fsDivFallbackApplied).toBe(true);
    expect(result.envelope?.body.status).toBe("000");
  });

  it("삼성전자 2024 — CFS 정상 → 폴백 없음", () => {
    const result = resolveFsDiv(
      () => acntAll(CORP.삼성전자, "2024", "11011", "CFS"),
      () => acntAll(CORP.삼성전자, "2024", "11011", "OFS"),
    );
    expect(result.fsDiv).toBe("CFS");
    expect(result.fsDivFallbackApplied).toBe(false);
  });

  it("신영증권 2023 — CFS/OFS 둘 다 013 → envelope null (해당 연도 전체 MISSING)", () => {
    const cfs = acntAll(CORP.신영증권, "2023", "11011", "CFS");
    const ofs = acntAll(CORP.신영증권, "2023", "11011", "OFS");
    expect(cfs.body.status).toBe("013");
    expect(ofs.body.status).toBe("013");

    const result = resolveFsDiv(
      () => cfs,
      () => ofs,
    );
    expect(result.envelope).toBeNull();
  });
});
