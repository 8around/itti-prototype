import { describe, expect, it } from "vitest";

import { ACNT_ALL_CANDIDATES } from "./catalog";
import {
  deriveFcf,
  deriveOperatingMargin,
  deriveQ4,
  deriveQoQ,
  deriveQuarterCf,
  deriveRoa,
  deriveRoeOwners,
  deriveRoeOwnersOnTotalEquity,
  deriveYoY,
  missingResolution,
} from "./derive";
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

/**
 * 최종 리뷰 픽스(I5). 피감수(연간)와 감수(3Q 누적)는 각자 독립적으로 폴백 체인을 돌기 때문에 서로
 * 다른 account_id에 HIT할 수 있다 — 원본에 짝이 맞는 조합이 아예 없는 실측 케이스라 MISSING으로
 * 떨어뜨리면 멀쩡한 분기까지 사라진다. 값은 남기되 경고 + 잠정 표시로 구분한다.
 */
describe("deriveQ4 — 피연산자 account_id 불일치 경고(I5)", () => {
  it("카카오 2025 eps_basic: 연간은 계속영업 EPS(1,138), 3Q 누적은 전체 EPS(1,042)라 경고 + provisional", () => {
    const annualList = acntAll(CORP.카카오, "2025", "11011", "CFS").body.list ?? [];
    const q3List = acntAll(CORP.카카오, "2025", "11014", "CFS").body.list ?? [];
    const annual = resolveAcntAllField(candidate("eps_basic"), annualList, "thstrm_amount", "CFS", false);
    const q3 = resolveAcntAllField(candidate("eps_basic"), q3List, "thstrm_add_amount", "CFS", false);

    // 연간 보고서엔 전체 EPS 행이 아예 없어 폴백 체인의 2순위(계속영업)에 HIT한다 — 원본에 짝이
    // 맞는 조합이 없는 케이스라 회피 불가.
    expect(annual.hit?.accountId).toBe("ifrs-full_BasicEarningsLossPerShareFromContinuingOperations");
    expect(q3.hit?.accountId).toBe("ifrs-full_BasicEarningsLossPerShare");

    const q4 = deriveQ4("q4_eps_basic", annual, q3);
    expect(q4.normalized).toBe(96);
    expect(q4.displayState).toBe("OK");
    expect(q4.provisional).toBe(true);
    expect(q4.derivation).toContain("계정이 달라");
    expect(q4.derivation).toContain("ifrs-full_BasicEarningsLossPerShareFromContinuingOperations");
  });

  it("같은 account_id에 HIT하면 경고 없이 기존 derivation 그대로 — 대다수 정상 경로 무변", () => {
    const annualList = acntAll(CORP.삼성전자, "2024", "11011", "CFS").body.list ?? [];
    const q3List = acntAll(CORP.삼성전자, "2024", "11014", "CFS").body.list ?? [];
    const annual = resolveAcntAllField(candidate("revenue"), annualList, "thstrm_amount", "CFS", false);
    const q3 = resolveAcntAllField(candidate("revenue"), q3List, "thstrm_add_amount", "CFS", false);

    expect(annual.hit?.accountId).toBe(q3.hit?.accountId);
    const q4 = deriveQ4("q4_revenue", annual, q3);
    expect(q4.provisional).toBeUndefined();
    expect(q4.derivation).not.toContain("주의");
  });
});

/**
 * 최종 리뷰 픽스(I2). `baseOf`가 provisional을 복사하지 않아 성장 resolution 2,560건 전부
 * provisional이 없었고, 그래서 승인 규칙 3("잠정치는 점선")의 LineChart 점선이 앱 전체에서 한 번도
 * 그려지지 않았다(킷친싱크 데모에서만 동작).
 */
describe("deriveQoQ/deriveYoY — 잠정 전파(I2)", () => {
  const ok = (value: number, provisional?: boolean): Resolution => ({
    metricKey: "operating_income",
    attempts: [],
    fsDiv: "CFS",
    fsDivFallbackApplied: false,
    normalized: value,
    displayState: "OK",
    parserVersion: "test",
    ...(provisional ? { provisional: true } : {}),
  });

  it("당기가 잠정(Q4 역산)이면 QoQ도 잠정", () => {
    expect(deriveQoQ("qoq_operating_income", ok(120, true), ok(100)).provisional).toBe(true);
  });

  it("직전 분기가 잠정이어도 잠정 — 비교 기준이 확정이 아니면 결과도 확정이 아니다", () => {
    expect(deriveYoY("yoy_operating_income", ok(120), ok(100, true)).provisional).toBe(true);
  });

  it("둘 다 직독 확정이면 provisional을 붙이지 않는다(undefined — 직렬화에서 키 자체가 빠진다)", () => {
    const r = deriveQoQ("qoq_operating_income", ok(120), ok(100));
    expect(r.provisional).toBeUndefined();
    expect(JSON.parse(JSON.stringify(r))).not.toHaveProperty("provisional");
  });

  it("숫자가 안 나오는 전환 상태(흑자전환 등)에서도 잠정 여부는 유지된다", () => {
    const r = deriveQoQ("qoq_operating_income", ok(120, true), ok(-50));
    expect(r.displayState).toBe("TURN_TO_PROFIT");
    expect(r.provisional).toBe(true);
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

/**
 * v4 — ROE 산정기준 2종. 기존 `roe`(DART M211550 직독)는 파생이 아니라 여기 대상이 아니다.
 * 기대값은 전부 `public/snapshots`의 실제 계정값에서 나온다.
 */
describe("deriveRoeOwners / deriveRoeOwnersOnTotalEquity — ROE 산정기준", () => {
  function inputs(corpCode: string, year: string, fs: "CFS" | "OFS") {
    const list = acntAll(corpCode, year, "11011", fs).body.list ?? [];
    const pick = (key: string) => resolveAcntAllField(candidate(key), list, "thstrm_amount", fs, false);
    return {
      netIncomeAttr: pick("net_income_attributable_to_owners"),
      netIncomeTotal: pick("net_income"),
      equityAttr: pick("equity_attributable_to_owners"),
      totalEquity: pick("total_equity"),
    };
  }

  it("삼성전자 2025 — 지배기업 소유주 귀속 기준 = 10.43%, 이띠 목업 v21.5 표기 '10.4%'와 일치", () => {
    const i = inputs(CORP.삼성전자, "2025", "CFS");
    expect(i.netIncomeAttr.normalized).toBe(44260956000000);
    expect(i.equityAttr.normalized).toBe(424313255000000);

    const roe = deriveRoeOwners(i.netIncomeAttr, i.netIncomeTotal, i.equityAttr, i.totalEquity);
    expect(roe.displayState).toBe("OK");
    expect(roe.normalized).toBeCloseTo((44260956000000 / 424313255000000) * 100, 6);
    expect(roe.normalized).toBeCloseTo(10.43, 2);
    // 폴백을 타지 않았으므로 caveat가 없어야 한다.
    expect(roe.derivationDetail?.caveat).toBeUndefined();
  });

  it("삼성전자 2025 — 연구원 엑셀 방식(분모 자본총계)은 같은 해 10.14%로 갈린다", () => {
    const i = inputs(CORP.삼성전자, "2025", "CFS");
    const mixed = deriveRoeOwnersOnTotalEquity(i.netIncomeAttr, i.netIncomeTotal, i.totalEquity);
    expect(mixed.normalized).toBeCloseTo((44260956000000 / 436320337000000) * 100, 6);
    expect(mixed.normalized).toBeCloseTo(10.14, 2);
  });

  it("LG화학 2024 — 총액은 흑자인데 귀속분은 적자라 부호가 갈린다", () => {
    const i = inputs(CORP.LG화학, "2024", "CFS");
    expect(i.netIncomeTotal.normalized).toBe(515011000000); // 총액 흑자
    expect(i.netIncomeAttr.normalized).toBe(-690854000000); // 귀속분 적자

    const roe = deriveRoeOwners(i.netIncomeAttr, i.netIncomeTotal, i.equityAttr, i.totalEquity);
    expect(roe.normalized).toBeCloseTo((-690854000000 / 33284180000000) * 100, 6);
    expect(roe.normalized).toBeLessThan(0);
  });

  it("앱클론 2025 — 연결 미작성(OFS)이라 귀속 계정이 없어 총액으로 폴백하고 caveat를 남긴다", () => {
    const i = inputs(CORP.앱클론, "2025", "OFS");
    expect(i.netIncomeAttr.displayState).toBe("MISSING");
    expect(i.equityAttr.displayState).toBe("MISSING");

    const roe = deriveRoeOwners(i.netIncomeAttr, i.netIncomeTotal, i.equityAttr, i.totalEquity);
    expect(roe.displayState).toBe("OK");
    expect(roe.normalized).toBeCloseTo((-17906959742 / 60438725297) * 100, 6);
    expect(roe.derivationDetail?.caveat).toContain("총액으로 대체");

    // 폴백 경로에서는 두 기준이 같은 값이 된다(총액 = 귀속분).
    const mixed = deriveRoeOwnersOnTotalEquity(i.netIncomeAttr, i.netIncomeTotal, i.totalEquity);
    expect(mixed.normalized).toBeCloseTo(roe.normalized!, 9);
  });

  it("분모가 0 이하면 NA_NEGATIVE_BASE (자본잠식)", () => {
    const ni = res(100);
    const eq = res(-50);
    expect(deriveRoeOwners(ni, ni, eq, eq).displayState).toBe("NA_NEGATIVE_BASE");
    expect(deriveRoeOwnersOnTotalEquity(ni, ni, eq).displayState).toBe("NA_NEGATIVE_BASE");
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
