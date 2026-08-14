import { describe, expect, it } from "vitest";

import { formatKrwCompact, formatPct, toEok } from "./format";

describe("formatKrwCompact — 원 단위 raw 금액 → 한글 축약", () => {
  it("삼성전자 2024 영업이익 Q4 역산(6,492,703백만원)이 '6조 4,927억'으로 읽힌다", () => {
    expect(formatKrwCompact(6_492_703_000_000)).toBe("6조 4,927억");
  });

  it("Q4 역산의 두 피연산자도 사람이 읽는 단위가 된다 — 자릿수를 세지 않아도 뺄셈이 검증된다", () => {
    expect(formatKrwCompact(32_725_961_000_000)).toBe("32조 7,260억");
    expect(formatKrwCompact(26_233_258_000_000)).toBe("26조 2,333억");
  });

  it("1조 미만은 억만, 1억 미만은 원 단위 그대로 — EPS(주당 1,116원)가 억으로 접히지 않는다", () => {
    expect(formatKrwCompact(492_703_000_000)).toBe("4,927억");
    expect(formatKrwCompact(1_116)).toBe("1,116원");
    expect(formatKrwCompact(0)).toBe("0원");
    // 정확히 1억은 억 표기의 하한이다.
    expect(formatKrwCompact(100_000_000)).toBe("1억");
    expect(formatKrwCompact(99_999_999)).toBe("99,999,999원");
  });

  it("억 자리가 10,000억으로 반올림되면 조로 올려 붙인다 — '5조 10,000억'이 되지 않는다", () => {
    // 5,999,950,000,000원 = 59,999.5억 → 억에서 반올림하면 60,000억 = 정확히 6조.
    expect(formatKrwCompact(5_999_950_000_000)).toBe("6조");
    // 억 나머지가 0이면 "조"만 쓴다.
    expect(formatKrwCompact(6_000_000_000_000)).toBe("6조");
  });

  it("음수는 수학 기호 −(U+2212)를 쓴다 — 산식의 뺄셈 기호와 같은 활자다", () => {
    expect(formatKrwCompact(-690_854_000_000)).toBe("−6,909억");
    expect(formatKrwCompact(-1_544)).toBe("−1,544원");
  });
});

describe("formatPct / toEok", () => {
  it("비율은 소수 1자리 — MetricValue의 PCT 포맷과 자릿수가 같아야 같은 값이 두 자리에서 같아 보인다", () => {
    expect(formatPct(12.3456)).toBe("12.3%");
    expect(formatPct(-26.858)).toBe("-26.9%");
    expect(formatPct(0)).toBe("0.0%");
  });

  it("toEok는 기존 동작 그대로다(회귀 확인)", () => {
    expect(toEok(100_000_000)).toBe(1);
  });
});
