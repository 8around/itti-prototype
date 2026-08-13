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
