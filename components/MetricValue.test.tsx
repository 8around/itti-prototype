import { describe, expect, it } from "vitest";

import MetricValue from "./MetricValue";

/**
 * 리뷰 픽스(I3) — ZERO_BY_FACT는 단위에 따라 표기가 갈려야 한다: PCT(배당수익률 등)는 "0%",
 * WON/KRW(금액)는 "0원". 예전엔 단위 무관 "0원" 고정이라 무배당 종목의 현금배당수익률이
 * "0원"으로 오표기됐다(T5 이연 지적).
 *
 * 서버 컴포넌트라 렌더 없이 함수를 직접 호출해 반환된 React 엘리먼트 트리를 검사한다 — jsdom 등
 * 별도 테스트 환경/의존성이 필요 없다(프로젝트에 @testing-library 등이 없다).
 */
describe("MetricValue — ZERO_BY_FACT 단위별 표기 (I3)", () => {
  it("PCT 단위는 0% 로 표기한다 (예: 무배당 종목의 현금배당수익률)", () => {
    const el = MetricValue({ state: "ZERO_BY_FACT", unit: "PCT" });
    const numSpan = (el.props.children as React.ReactNode[])[0] as { props: { children: string } };
    expect(numSpan.props.children).toBe("0%");
  });

  it("WON 단위는 0원 으로 표기한다 (예: 무배당 종목의 DPS)", () => {
    const el = MetricValue({ state: "ZERO_BY_FACT", unit: "WON" });
    const numSpan = (el.props.children as React.ReactNode[])[0] as { props: { children: string } };
    expect(numSpan.props.children).toBe("0원");
  });

  it("KRW 단위는 0원 으로 표기한다", () => {
    const el = MetricValue({ state: "ZERO_BY_FACT", unit: "KRW" });
    const numSpan = (el.props.children as React.ReactNode[])[0] as { props: { children: string } };
    expect(numSpan.props.children).toBe("0원");
  });

  it("OK 상태는 이번 픽스와 무관하게 종전대로 formatValue를 그대로 쓴다", () => {
    const el = MetricValue({ state: "OK", value: 12.3, unit: "PCT" });
    const numSpan = (el.props.children as React.ReactNode[])[0] as { props: { children: string } };
    expect(numSpan.props.children).toBe("12.3%");
  });
});
