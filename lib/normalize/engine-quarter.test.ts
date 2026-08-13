import { describe, expect, it } from "vitest";

import { ALL_QUARTER_PERIODS, QUARTER_YEARS, resolveStockQuarter, resolveStockQuarters } from "./engine";
import { FIN_HOLDING_EXTRA_CANDIDATES } from "./fin-holding-catalog";
import { resolveFinExtras } from "./resolveFinExtras";
import { CORP, SNAPSHOTS_DIR } from "./test-support";

/**
 * v2 T2 — 분기 축(quarters[]) + QoQ/YoY 통합 테스트. 실제 스냅샷만 사용한다(mock 금지, 브리프
 * 검증 항목 그대로). task-T2-report.md에 이 파일의 실행 결과를 그대로 인용한다.
 */

describe("resolveStockQuarter/resolveStockQuarters — 분기 축 뼈대", () => {
  it("종목당 16개(연도4×분기4) 엔트리가 생성되고 period/reprtCode가 규약대로 매핑된다", () => {
    const quarters = resolveStockQuarters(SNAPSHOTS_DIR, { stockCode: "005930", corpCode: CORP.삼성전자, name: "삼성전자" });
    expect(quarters).toHaveLength(16);
    expect(quarters.map((q) => q.period)).toEqual(ALL_QUARTER_PERIODS);

    const reprtByQuarter = { 1: "11013", 2: "11012", 3: "11014", 4: "11011" } as const;
    for (const q of quarters) {
      expect(q.reprtCode).toBe(reprtByQuarter[q.quarter]);
    }
  });

  it("ALL_QUARTER_PERIODS = QUARTER_YEARS × 4분기, 정렬 순서 그대로", () => {
    expect(ALL_QUARTER_PERIODS).toHaveLength(QUARTER_YEARS.length * 4);
    expect(ALL_QUARTER_PERIODS[0]).toBe("2023Q1");
    expect(ALL_QUARTER_PERIODS.at(-1)).toBe("2026Q4");
  });
});

describe("삼성전자 2024 — IS/CIS 흐름 분기 검산(Q1+Q2+Q3+Q4 = 연간)", () => {
  const quarters = resolveStockQuarters(SNAPSHOTS_DIR, { stockCode: "005930", corpCode: CORP.삼성전자, name: "삼성전자" });
  const q2024 = quarters.filter((q) => q.bsnsYear === "2024");

  it("매출액 — Q1 71,915,601,000,000 + Q2 74,068,302,000,000 + Q3 79,098,731,000,000 + Q4 75,788,269,000,000 = 연간 300,870,903,000,000", () => {
    const byQuarter = Object.fromEntries(q2024.map((q) => [q.quarter, q.resolutions.revenue.normalized]));
    expect(byQuarter[1]).toBe(71915601000000);
    expect(byQuarter[2]).toBe(74068302000000);
    expect(byQuarter[3]).toBe(79098731000000);
    expect(byQuarter[4]).toBe(75788269000000);
    const sum = (byQuarter[1] ?? 0) + (byQuarter[2] ?? 0) + (byQuarter[3] ?? 0) + (byQuarter[4] ?? 0);
    expect(sum).toBe(300870903000000);
  });

  it("Q4 매출액은 provisional:true + derivation에 실수치가 남는다(Q4 역산)", () => {
    const q4 = q2024.find((q) => q.quarter === 4)!;
    expect(q4.resolutions.revenue.provisional).toBe(true);
    expect(q4.resolutions.revenue.derivation).toBe("Q4 = 300,870,903,000,000 − 225,082,634,000,000");
  });

  it("Q1~Q3 매출액은 직독값이라 provisional이 세팅되지 않는다(undefined)", () => {
    for (const q of q2024.filter((q) => q.quarter !== 4)) {
      expect(q.resolutions.revenue.provisional).toBeUndefined();
    }
  });
});

describe("삼성전자 2024 — 영업활동현금흐름(CF) 분기 단일화(T1V 판정2 검산)", () => {
  const quarters = resolveStockQuarters(SNAPSHOTS_DIR, { stockCode: "005930", corpCode: CORP.삼성전자, name: "삼성전자" });
  const q2024 = quarters.filter((q) => q.bsnsYear === "2024");
  const byQuarter = Object.fromEntries(q2024.map((q) => [q.quarter, q.resolutions.operating_cf.normalized]));

  it("Q1 = 11013.thstrm 직독 = 11,866,306,000,000(11.87조)", () => {
    expect(byQuarter[1]).toBe(11866306000000);
  });

  it("Q2 = 11012.thstrm − 11013.thstrm = 16,895,410,000,000(≈16.90조)", () => {
    expect(byQuarter[2]).toBe(16895410000000);
  });

  it("Q3 = 11014.thstrm − 11012.thstrm = 22,198,634,000,000(≈22.20조)", () => {
    expect(byQuarter[3]).toBe(22198634000000);
  });

  it("Q4 = 11011.thstrm − 11014.thstrm = 22,022,271,000,000(≈22.02조), provisional:true", () => {
    expect(byQuarter[4]).toBe(22022271000000);
    const q4 = q2024.find((q) => q.quarter === 4)!;
    expect(q4.resolutions.operating_cf.provisional).toBe(true);
    expect(q4.resolutions.operating_cf.derivation).toBe("Q4(CF) = 72,982,621,000,000 − 50,960,350,000,000");
  });

  it("4분기 합 = 연간(72,982,621,000,000)", () => {
    const sum = (byQuarter[1] ?? 0) + (byQuarter[2] ?? 0) + (byQuarter[3] ?? 0) + (byQuarter[4] ?? 0);
    expect(sum).toBe(72982621000000);
  });
});

describe("2026 반기(11012) — 마감 전 013 → MISSING(0 채우기 금지)", () => {
  it("삼성전자 2026Q2 전 지표가 MISSING이고 fiscalPeriodName도 빈 값이다", () => {
    const q = resolveStockQuarter(SNAPSHOTS_DIR, { stockCode: "005930", corpCode: CORP.삼성전자, name: "삼성전자" }, "2026", 2);
    expect(q.reprtCode).toBe("11012");
    expect(q.fiscalPeriodName).toBe("");
    expect(q.resolutions.revenue.displayState).toBe("MISSING");
    expect(q.resolutions.revenue.normalized).toBeNull();
    expect(q.resolutions.operating_cf.displayState).toBe("MISSING");
    expect(q.resolutions.total_assets.displayState).toBe("MISSING");
  });
});

describe("QoQ/YoY — 전환 상태 4분면 실측(mock 금지, 실제 스냅샷에서 발견한 사례)", () => {
  it("정상 % — 삼성전자 2023Q2 QoQ 매출 = -5.87%(직전>0, 당기>0)", () => {
    const quarters = resolveStockQuarters(SNAPSHOTS_DIR, { stockCode: "005930", corpCode: CORP.삼성전자, name: "삼성전자" });
    const q = quarters.find((q) => q.period === "2023Q2")!;
    const r = q.resolutions.qoq_revenue;
    expect(r.displayState).toBe("OK");
    expect(r.normalized).toBeCloseTo(-5.866838550520006, 6);
  });

  it("TURN_TO_PROFIT(흑자전환) — SK하이닉스 2023Q4 QoQ 영업이익(직전 -1.79조 → 당기 +0.35조)", () => {
    const quarters = resolveStockQuarters(SNAPSHOTS_DIR, { stockCode: "000660", corpCode: CORP.SK하이닉스, name: "SK하이닉스" });
    const q = quarters.find((q) => q.period === "2023Q4")!;
    const r = q.resolutions.qoq_operating_income;
    expect(r.displayState).toBe("TURN_TO_PROFIT");
    expect(r.normalized).toBeNull();
  });

  it("TURN_TO_LOSS(적자전환) — POSCO홀딩스 2023Q4 QoQ 당기순이익(지배주주)(직전 +4,882억 → 당기 -2,063억)", () => {
    const quarters = resolveStockQuarters(SNAPSHOTS_DIR, { stockCode: "005490", corpCode: CORP.POSCO홀딩스, name: "POSCO홀딩스" });
    const q = quarters.find((q) => q.period === "2023Q4")!;
    const r = q.resolutions.qoq_net_income_attributable_to_owners;
    expect(r.displayState).toBe("TURN_TO_LOSS");
    expect(r.normalized).toBeNull();
  });

  it("LOSS_CONTINUED(적자지속) — SK하이닉스 2023Q2 QoQ 영업이익(직전 -3.40조 → 당기 -2.88조)", () => {
    const quarters = resolveStockQuarters(SNAPSHOTS_DIR, { stockCode: "000660", corpCode: CORP.SK하이닉스, name: "SK하이닉스" });
    const q = quarters.find((q) => q.period === "2023Q2")!;
    const r = q.resolutions.qoq_operating_income;
    expect(r.displayState).toBe("LOSS_CONTINUED");
    expect(r.normalized).toBeNull();
  });

  it("비교 대상 분기가 데이터셋 밖(2023Q1의 직전분기 2022Q4) — MISSING", () => {
    const quarters = resolveStockQuarters(SNAPSHOTS_DIR, { stockCode: "005930", corpCode: CORP.삼성전자, name: "삼성전자" });
    const q = quarters.find((q) => q.period === "2023Q1")!;
    expect(q.resolutions.qoq_revenue.displayState).toBe("MISSING");
    expect(q.resolutions.yoy_revenue.displayState).toBe("MISSING");
  });
});

/**
 * 최종 리뷰 픽스(C1·I3·I6). 이 describe는 원래 "2024Q4 슬롯의 fiscalPeriodName은 '제 70 기'"를
 * 단언했는데, 그건 **버그(1년 어긋난 두 보고서를 뺀 상태)를 고정한 테스트**였다. 라벨만 보고
 * Q4 산술은 검증하지 않아 제71기 4Q가 212.08억 대신 554.39억으로, 제72기 4Q가 +470.51억 대신
 * −126.43억(부호 반전, 존재하지 않는 적자)으로 나오는 걸 놓쳤다 — 이제 값으로 고정한다.
 */
describe("신영증권(3월 결산) — Q4 역산 기수 페어링(C1)", () => {
  const quarters = resolveStockQuarters(SNAPSHOTS_DIR, { stockCode: "001720", corpCode: CORP.신영증권, name: "신영증권" });
  const at = (period: string) => quarters.find((q) => q.period === period)!;

  it("Q4 슬롯은 같은 해가 아니라 다음 해 사업보고서와 짝지어 3Q 누적과 기수를 맞춘다", () => {
    // 분기보고서는 제N기인데 같은 bsns_year의 사업보고서는 제N−1기다(T1V 판정5).
    expect(at("2024Q1").fiscalPeriodName).toBe("제 71 기 1분기말");
    expect(at("2024Q3").fiscalPeriodName).toBe("제 71 기 3분기말");
    // 따라서 제71기 4Q의 피감수는 bsns_year=2025의 11011에 있다.
    expect(at("2024Q4").fiscalPeriodName).toBe("제 71 기");
    expect(at("2024Q4").sourceYear).toBe("2025");
    expect(at("2025Q4").fiscalPeriodName).toBe("제 72 기");
    expect(at("2025Q4").sourceYear).toBe("2026");
  });

  it("제71기 4Q 영업이익 = 212.08억(= 제71기 연간 1,361.46억 − 제71기 3Q누적 1,149.38억)", () => {
    const q4 = at("2024Q4").resolutions.operating_income;
    expect(q4.normalized).toBe(21_207_648_944);
    expect(q4.displayState).toBe("OK");
    expect(q4.provisional).toBe(true);
  });

  it("제72기 4Q 영업이익 = +470.51억 — 예전 페어링은 −126.43억으로 없는 적자를 그렸다", () => {
    const q4 = at("2025Q4").resolutions.operating_income;
    expect(q4.normalized).toBe(47_050_591_778);
    expect(q4.normalized).toBeGreaterThan(0);
  });

  it("제70기 4Q = 435.85억 — 2023Q4 슬롯도 제70기 연간(bsns_year=2024)과 짝이 맞는다", () => {
    expect(at("2023Q4").resolutions.operating_income.normalized).toBe(43_584_702_866);
    expect(at("2023Q4").fiscalPeriodName).toBe("제 70 기");
  });

  it("제73기 연간 보고서가 아직 없는 2026Q4는 억지로 채우지 않고 MISSING", () => {
    expect(at("2026Q4").resolutions.operating_income.displayState).toBe("MISSING");
    expect(at("2026Q4").fiscalPeriodName).toBe("");
  });

  it("배열 순서 = 실제 회계기간 순서 — 기수가 단조 증가한다(I3: 인덱스로 '최신'을 골라도 안전)", () => {
    const ordinals = quarters
      .map((q) => /제\s*(\d+)\s*기/.exec(q.fiscalPeriodName))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => Number(m[1]));
    expect(ordinals).toEqual([...ordinals].sort((a, b) => a - b));
    expect(ordinals).toEqual([70, 70, 70, 71, 71, 71, 71, 72, 72, 72, 72, 73]);
  });

  it("재무상태 축의 '최신 분기말'이 제73기 1분기말(13.57조) — 예전에는 더 오래된 제72기말을 골랐다", () => {
    const withAssets = quarters.filter((q) => q.resolutions.total_assets.displayState !== "MISSING");
    const latest = withAssets[withAssets.length - 1];
    expect(latest.period).toBe("2026Q1");
    expect(latest.fiscalPeriodName).toBe("제 73 기 1분기말");
    expect(latest.resolutions.total_assets.normalized).toBe(13_572_548_119_423);
  });
});

describe("12월 결산 종목은 보정 대상이 아니다 — 분기 값 회귀 기준(C1)", () => {
  it("삼성전자 Q4 슬롯은 같은 bsns_year 사업보고서를 그대로 쓴다(sourceYear === bsnsYear)", () => {
    const quarters = resolveStockQuarters(SNAPSHOTS_DIR, { stockCode: "005930", corpCode: CORP.삼성전자, name: "삼성전자" });
    for (const q of quarters) {
      expect(q.sourceYear).toBe(q.bsnsYear);
    }
    expect(quarters.find((q) => q.period === "2024Q4")!.fiscalPeriodName).toBe("제 56 기");
  });

  it("삼성전자 2024 4개 분기 영업이익 실측값 고정 — Q4 역산 페어링 변경의 회귀 기준", () => {
    const quarters = resolveStockQuarters(SNAPSHOTS_DIR, { stockCode: "005930", corpCode: CORP.삼성전자, name: "삼성전자" });
    const oi = (p: string) => quarters.find((q) => q.period === p)!.resolutions.operating_income.normalized;
    expect(oi("2024Q1")).toBe(6_606_009_000_000);
    expect(oi("2024Q2")).toBe(10_443_878_000_000);
    expect(oi("2024Q3")).toBe(9_183_371_000_000);
    expect(oi("2024Q4")).toBe(6_492_703_000_000);
  });
});

describe("KB금융 — 금융 확장(fin extras) 분기(§4, reprtCode 파라미터)", () => {
  it("2024Q1(11013) 순이자손익/순수수료손익/보험손익 — T1V 판정4와 정확히 일치", () => {
    const res = resolveFinExtras(SNAPSHOTS_DIR, CORP.KB금융, "2024", FIN_HOLDING_EXTRA_CANDIDATES, "11013");
    expect(res.fsDiv).toBe("CFS");
    expect(res.resolutions.net_interest_income.normalized).toBe(3151485000000);
    expect(res.resolutions.net_fee_income.normalized).toBe(990093000000);
    expect(res.resolutions.insurance_result.normalized).toBe(538379000000);
  });

  it("reprtCode 기본값(11011)은 기존 호출부와 동일한 연간 결과를 낸다 — 기존 호출부 무변 확인", () => {
    const withDefault = resolveFinExtras(SNAPSHOTS_DIR, CORP.KB금융, "2024", FIN_HOLDING_EXTRA_CANDIDATES);
    const withExplicit11011 = resolveFinExtras(SNAPSHOTS_DIR, CORP.KB금융, "2024", FIN_HOLDING_EXTRA_CANDIDATES, "11011");
    expect(withDefault.resolutions.net_interest_income.normalized).toBe(withExplicit11011.resolutions.net_interest_income.normalized);
  });
});

describe("EPS Q4 — 가중평균주식수 변동으로 인한 provisional 플래그(§1)", () => {
  it("삼성전자 2024Q4 eps_basic = 1,116(= 4,950 − 3,834), provisional:true + 주의 문구", () => {
    const q4 = resolveStockQuarter(SNAPSHOTS_DIR, { stockCode: "005930", corpCode: CORP.삼성전자, name: "삼성전자" }, "2024", 4);
    const eps = q4.resolutions.eps_basic;
    expect(eps.normalized).toBe(1116);
    expect(eps.provisional).toBe(true);
    expect(eps.derivation).toContain("가중평균주식수");
  });

  it("Q1~Q3 eps_basic은 직독값이라 provisional이 세팅되지 않는다", () => {
    for (const quarter of [1, 2, 3] as const) {
      const q = resolveStockQuarter(SNAPSHOTS_DIR, { stockCode: "005930", corpCode: CORP.삼성전자, name: "삼성전자" }, "2024", quarter);
      expect(q.resolutions.eps_basic.provisional).toBeUndefined();
    }
  });
});

describe("BS(시점) — 차분·역산 없이 매 분기 직독(§1)", () => {
  it("삼성전자 자산총계가 4개 분기 모두 서로 다른 시점값으로 직독된다(합산 검증 없음 — 시점 데이터)", () => {
    const quarters = resolveStockQuarters(SNAPSHOTS_DIR, { stockCode: "005930", corpCode: CORP.삼성전자, name: "삼성전자" }).filter(
      (q) => q.bsnsYear === "2024",
    );
    for (const q of quarters) {
      expect(q.resolutions.total_assets.displayState).toBe("OK");
      expect(q.resolutions.total_assets.provisional).toBeUndefined();
    }
    // 시점 데이터라 원장상 서로 다른 값(우연히 같을 이론적 가능성 낮음) — 실측으로 4개 분기가 모두 다름을 확인한다.
    const values = new Set(quarters.map((q) => q.resolutions.total_assets.normalized));
    expect(values.size).toBe(4);
  });
});
