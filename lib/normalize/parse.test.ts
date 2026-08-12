import { describe, expect, it } from "vitest";

import { formatAmount, parseAmount } from "./parse";

describe("parseAmount", () => {
  it("결측 3종(빈문자열/하이픈/#########)을 전부 null로 변환한다 (#3 #4 #41)", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("-")).toBeNull();
    expect(parseAmount("#########")).toBeNull();
  });

  it("idx_val 키 자체가 없을 때(undefined)도 null이다 (#40)", () => {
    expect(parseAmount(undefined)).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });

  it("콤마 유무와 무관하게 숫자를 파싱한다 (#4)", () => {
    expect(parseAmount("514531948000000")).toBe(514531948000000);
    expect(parseAmount("514,531,948,000,000")).toBe(514531948000000);
  });

  it("선행 마이너스 음수를 그대로 파싱한다(괄호 표기 아님)", () => {
    expect(parseAmount("-4480835000000")).toBe(-4480835000000);
    expect(parseAmount("-26.858")).toBeCloseTo(-26.858);
  });

  it("앞뒤 공백을 무시한다", () => {
    expect(parseAmount("  1,234  ")).toBe(1234);
  });
});

describe("formatAmount", () => {
  it("천단위 콤마를 삽입한다", () => {
    expect(formatAmount(300870903000000)).toBe("300,870,903,000,000");
  });
});
