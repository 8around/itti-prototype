import { describe, expect, it } from "vitest";

import { buildDerivationLine, formatStepValue } from "./derivationText";
import type { DerivationDetail } from "./normalize/types";

/** 실측 고정점 — 삼성전자 2024 4Q 영업이익 역산(data/derived.json에 그대로 들어 있는 구조). */
const SAMSUNG_Q4: DerivationDetail = {
  kind: "q4_reverse",
  resultLabel: "영업이익",
  steps: [
    { label: "2024 사업보고서 연간", value: 32_725_961_000_000 },
    { label: "2024 3분기보고서 누적", value: 26_233_258_000_000, op: "minus" },
  ],
  unit: "KRW",
};

describe("buildDerivationLine — 산식 한 줄 조립", () => {
  it("Q4 역산이 브리프가 요구한 형태로 읽힌다(억/조 환산 + 한글 지표명 + 기간)", () => {
    const line = buildDerivationLine(SAMSUNG_Q4, 6_492_703_000_000, "OK", "24.4Q");
    expect(line.head).toBe("24.4Q 영업이익 6조 4,927억");
    expect(line.body).toBe("2024 사업보고서 연간 32조 7,260억 − 2024 3분기보고서 누적 26조 2,333억");
    expect(line.transition).toBe(false);
  });

  it("기간 라벨이 없으면(SourcePanel 탭처럼) 지표명부터 시작한다", () => {
    expect(buildDerivationLine(SAMSUNG_Q4, 6_492_703_000_000, "OK").head).toBe("영업이익 6조 4,927억");
  });

  it("SCALAR step(백분율 환산 100)은 라벨 없이 '× 100'으로만 찍힌다 — 결과에 이미 %가 붙어 중복이다", () => {
    const roa: DerivationDetail = {
      kind: "ratio",
      resultLabel: "ROA",
      steps: [
        { label: "당기순이익(총액)", value: 34_451_000_000_000 },
        { label: "자산총계", value: 514_531_000_000_000, op: "div" },
        { label: "백분율 환산", value: 100, op: "mul", unit: "SCALAR" },
      ],
      unit: "PCT",
    };
    const line = buildDerivationLine(roa, 6.6955, "OK", "24년");
    expect(line.head).toBe("24년 ROA 6.7%");
    expect(line.body).toBe("당기순이익(총액) 34조 4,510억 ÷ 자산총계 514조 5,310억 × 100");
  });

  it("KRW_MILLION step은 백만원으로 읽는다 — 원 단위로 착각하면 10^6배 어긋난다", () => {
    // alotMatter 원본이 백만원 단위라 29,857은 29,857백만원 = 298.57억이다.
    expect(formatStepValue({ label: "현금배당금총액", value: 29_857, unit: "KRW_MILLION" })).toBe("299억");
    // 같은 숫자를 단위 태그 없이 읽으면 29,857원이 된다 — 태그가 하는 일이 이것이다.
    expect(formatStepValue({ label: "현금배당금총액", value: 29_857 })).toBe("29,857원");
  });

  it("흑자전환 같은 전환 상태는 등호가 아니라 '직전 → 당기' 비교로 읽힌다", () => {
    const turn: DerivationDetail = {
      kind: "growth",
      resultLabel: "영업이익 YoY",
      steps: [
        { label: "전년 동분기 2023Q3", value: -177_900_000_000 },
        { label: "당기 2024Q3", value: 1_792_000_000_000 },
      ],
      unit: "PCT",
      caveat: "직전 ≤0 → 당기 >0 (흑자전환) — 증감률(%)은 분모가 0 이하라 왜곡되므로 산출하지 않고 상태만 표기한다",
      transition: true,
    };
    const line = buildDerivationLine(turn, null, "TURN_TO_PROFIT", "24.3Q");
    expect(line.transition).toBe(true);
    expect(line.head).toBe("24.3Q 영업이익 YoY 흑자전환");
    expect(line.body).toBe("전년 동분기 2023Q3 −1,779억 → 당기 2024Q3 1조 7,920억");
    expect(line.caveat).toContain("흑자전환");
  });

  it("caveat은 그대로 실려 나온다 — 계정 불일치와 EPS 근사가 동시에 걸린 경우 둘 다 보인다", () => {
    const line = buildDerivationLine(
      { ...SAMSUNG_Q4, resultLabel: "기본주당이익", caveat: "연간(A)과 3분기 누적(B)의 계정이 달라 두 값의 개념이 어긋날 수 있음(잠정치) · 가중평균주식수 변동으로 근사치일 수 있음(잠정치)" },
      1_116,
      "OK",
    );
    expect(line.caveat).toContain("계정이 달라");
    expect(line.caveat).toContain("가중평균주식수");
  });
});
