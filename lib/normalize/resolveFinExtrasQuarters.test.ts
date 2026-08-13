import { describe, expect, it } from "vitest";

import { ALL_QUARTER_PERIODS } from "./engine";
import { resolveProfileExtrasQuarters } from "./resolveFinExtrasQuarters";
import { CORP, SNAPSHOTS_DIR } from "./test-support";

/**
 * v2 T6 — fin extras(net_interest_income·net_fee_income·insurance_result 등) 분기 축 통합
 * 테스트. 실제 스냅샷만 사용한다(mock 금지) — engine-quarter.test.ts의 base 분기 검증과 동일한
 * 원칙. 숫자 근거는 engine-quarter.test.ts "KB금융 — 금융 확장(fin extras) 분기" describe와
 * 동일 스냅샷에서 재확인했다.
 */

describe("resolveProfileExtrasQuarters — STANDARD는 후보가 없어 즉시 빈 배열", () => {
  it("삼성전자(STANDARD)는 파일 I/O 없이 []을 반환한다", () => {
    expect(resolveProfileExtrasQuarters(SNAPSHOTS_DIR, "STANDARD", CORP.삼성전자)).toEqual([]);
  });
});

describe("KB금융(FIN_HOLDING) — 16분기 전체 생성 + Q1 직독값", () => {
  const quarters = resolveProfileExtrasQuarters(SNAPSHOTS_DIR, "FIN_HOLDING", CORP.KB금융);

  it("종목당 16개(연도4×분기4) 엔트리, period 순서는 base 엔진(ALL_QUARTER_PERIODS)과 동일", () => {
    expect(quarters).toHaveLength(16);
    expect(quarters.map((q) => q.period)).toEqual(ALL_QUARTER_PERIODS);
  });

  it("2024Q1(11013) 순이자손익 3,151,485,000,000 / 순수수료손익 990,093,000,000 — reprtCode 파라미터 직독", () => {
    const q1 = quarters.find((q) => q.period === "2024Q1")!;
    expect(q1.resolutions.net_interest_income.normalized).toBe(3151485000000);
    expect(q1.resolutions.net_interest_income.provisional).toBeUndefined();
    expect(q1.resolutions.net_fee_income.normalized).toBe(990093000000);
    expect(q1.resolutions.insurance_result.normalized).toBe(538379000000);
  });
});

describe("KB금융 — Q4 역산(연간 11011 − 3Q누적 11014.thstrm_add) + provisional", () => {
  const quarters = resolveProfileExtrasQuarters(SNAPSHOTS_DIR, "FIN_HOLDING", CORP.KB금융);
  const q4 = quarters.find((q) => q.period === "2024Q4")!;

  it("순이자손익 Q4 = 12,826,714,000,000 − 9,522,689,000,000 = 3,304,025,000,000, provisional:true", () => {
    expect(q4.resolutions.net_interest_income.normalized).toBe(3304025000000);
    expect(q4.resolutions.net_interest_income.provisional).toBe(true);
    expect(q4.resolutions.net_interest_income.derivation).toBe("Q4 = 12,826,714,000,000 − 9,522,689,000,000");
  });

  it("순수수료손익 Q4 = 3,849,627,000,000 − 2,852,432,000,000 = 997,195,000,000, provisional:true", () => {
    expect(q4.resolutions.net_fee_income.normalized).toBe(997195000000);
    expect(q4.resolutions.net_fee_income.provisional).toBe(true);
  });
});

/**
 * 최종 리뷰 픽스(I6). 예전에는 Q1(누적 == 단일분기라 두 필드를 헷갈려도 값이 같다)만 절대값으로
 * 고정하고 Q2/Q3는 QoQ 비율로 **간접** 확인했다 — `thstrm_amount`(단일 3개월)와
 * `thstrm_add_amount`(누적)를 바꿔 읽는 회귀가 나도 Q1 테스트는 통과한다. 판별력이 있는 Q2/Q3를
 * 절대값으로 직접 고정한다.
 */
describe("KB금융 — Q2/Q3 단일분기 절대값(누적과 구분되는 판별 지점)", () => {
  const quarters = resolveProfileExtrasQuarters(SNAPSHOTS_DIR, "FIN_HOLDING", CORP.KB금융);
  const at = (period: string) => quarters.find((q) => q.period === period)!;

  it("순이자손익 2024Q2 = 3,206,237백만 · 2024Q3 = 3,164,967백만 (직독 3개월치, 누적 아님)", () => {
    expect(at("2024Q2").resolutions.net_interest_income.normalized).toBe(3_206_237_000_000);
    expect(at("2024Q3").resolutions.net_interest_income.normalized).toBe(3_164_967_000_000);
  });

  it("Q2/Q3는 직독값이라 provisional이 붙지 않는다(Q4 역산과 구분)", () => {
    expect(at("2024Q2").resolutions.net_interest_income.provisional).toBeUndefined();
    expect(at("2024Q3").resolutions.net_interest_income.provisional).toBeUndefined();
  });

  it("4개 분기 합 = 연간 순이자손익 12,826,714백만 — 누적을 단일분기로 잘못 읽으면 깨진다", () => {
    const sum = (["2024Q1", "2024Q2", "2024Q3", "2024Q4"] as const)
      .map((p) => at(p).resolutions.net_interest_income.normalized ?? 0)
      .reduce((a, b) => a + b, 0);
    expect(sum).toBe(12_826_714_000_000);
  });
});

describe("KB금융 — QoQ 2차 패스(2024Q2 vs 2024Q1, 둘 다 직독 OK)", () => {
  const quarters = resolveProfileExtrasQuarters(SNAPSHOTS_DIR, "FIN_HOLDING", CORP.KB금융);
  const q2 = quarters.find((q) => q.period === "2024Q2")!;

  it("순이자손익 QoQ = (3,206,237,000,000 − 3,151,485,000,000) ÷ 3,151,485,000,000 × 100 ≈ 1.737%", () => {
    const r = q2.resolutions.qoq_net_interest_income;
    expect(r.displayState).toBe("OK");
    expect(r.normalized).toBeCloseTo(1.7373396985865392, 6);
  });

  it("비교 대상 분기가 데이터셋 밖(2023Q1)이면 QoQ/YoY가 MISSING — 근거 없는 0 채우기 없음", () => {
    const q1 = quarters.find((q) => q.period === "2023Q1")!;
    expect(q1.resolutions.qoq_net_interest_income.displayState).toBe("MISSING");
    expect(q1.resolutions.qoq_net_interest_income.normalized).toBeNull();
    expect(q1.resolutions.yoy_net_interest_income.displayState).toBe("MISSING");
  });
});

describe("삼성증권(FIN_SECURITIES) — 보험손익 후보 자체가 카탈로그에 없어 자동 제외", () => {
  it("모든 분기 resolutions에 insurance_result 키가 아예 생성되지 않는다(NOT_IN_PROFILE 게이팅 전제 조건)", () => {
    const quarters = resolveProfileExtrasQuarters(SNAPSHOTS_DIR, "FIN_SECURITIES", CORP.삼성증권);
    for (const q of quarters) {
      expect(q.resolutions.insurance_result, q.period).toBeUndefined();
      expect(q.resolutions.qoq_insurance_result, q.period).toBeUndefined();
    }
  });

  it("순이자손익은 카탈로그에 있어 정상 resolve된다(대조군)", () => {
    const quarters = resolveProfileExtrasQuarters(SNAPSHOTS_DIR, "FIN_SECURITIES", CORP.삼성증권);
    const q1 = quarters.find((q) => q.period === "2024Q1")!;
    expect(q1.resolutions.net_interest_income.displayState).toBe("OK");
  });
});

describe("신영증권(FIN_SECURITIES, 3월 결산) — 순액 계정 미작성으로 MISSING이 정직하게 뜬다", () => {
  it("순이자손익이 다수 분기에서 MISSING(013 또는 NO_ROW) — 카탈로그 결함이 아니라 실제 계정 편차", () => {
    const quarters = resolveProfileExtrasQuarters(SNAPSHOTS_DIR, "FIN_SECURITIES", CORP.신영증권);
    const missingCount = quarters.filter((q) => q.resolutions.net_interest_income?.displayState === "MISSING").length;
    expect(missingCount).toBeGreaterThan(0);
  });
});

/**
 * 최종 리뷰 픽스(C1). base 엔진(engine.ts)만 고치고 이 경로를 빠뜨리면 같은 종목 화면에서 손익
 * 막대는 맞고 이자수익 막대는 1년 어긋난 채로 남는다 — 두 경로가 같은 보정을 쓰는지 고정한다.
 */
describe("신영증권 fin extras — Q4도 base 엔진과 같은 기수 페어링을 쓴다(C1)", () => {
  const quarters = resolveProfileExtrasQuarters(SNAPSHOTS_DIR, "FIN_SECURITIES", CORP.신영증권);
  const at = (period: string) => quarters.find((q) => q.period === period)!;

  it("이자수익 제71기 4Q = 72,409,497,148 (= 제71기 연간 312,015,769,522 − 제71기 3Q누적 239,606,272,374)", () => {
    const q4 = at("2024Q4").resolutions.interest_revenue;
    expect(q4.normalized).toBe(72_409_497_148);
    expect(q4.provisional).toBe(true);
    // 같은 해 사업보고서(제70기 321,899,677,873)와 짝지으면 82,293,405,499 — 13.7% 과대.
    expect(q4.normalized).not.toBe(82_293_405_499);
  });

  it("제73기 연간이 아직 없는 2026Q4는 MISSING", () => {
    expect(at("2026Q4").resolutions.interest_revenue.displayState).toBe("MISSING");
  });
});
