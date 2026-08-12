import { describe, expect, it } from "vitest";

import { ALOT_MATTER_REPORT_YEAR } from "./normalize/engine";
import type { Resolution } from "./normalize/types";
import { buildSourcePanelProps } from "./sourcePanelHelpers";

function okPct(metricKey: string, normalized: number): Resolution {
  return { metricKey, attempts: [], fsDiv: "CFS", fsDivFallbackApplied: false, normalized, displayState: "OK", parserVersion: "t4.1" };
}

/**
 * 리뷰 픽스(I1b) — dividend_payout_fallback은 자체 MetricCandidate가 없는 파생 지표라 방치하면
 * findCandidate가 undefined를 반환하고 buildSourcePanelProps가 기본값(acntAll)으로 오배선한다.
 * requestId가 alotMatter__ 접두로 조립돼야 SourcePanel "원문 보기"가 실제 alotMatter 스냅샷
 * (카카오 29,857/55,277 등 원본 도달)을 가리킨다.
 */
describe("buildSourcePanelProps — dividend_payout_fallback 원천 라우팅 (I1b)", () => {
  it("acntAll이 아니라 alotMatter로 라우팅된다", () => {
    const resolution = okPct("dividend_payout_fallback", 54.006);
    const props = buildSourcePanelProps("dividend_payout_fallback", "00258801", "2024", resolution, "PCT", "STANDARD");
    expect(props.requestId).toBe(`alotMatter__00258801__${ALOT_MATTER_REPORT_YEAR}__11011`);
    expect(props.probeParams?.endpoint).toBe("alotMatter");
    expect(props.summaryMeta.source).toBe("DART 사업보고서(배당에 관한 사항)");
  });

  it("payout(idx6, ALOT_MATTER_CANDIDATES 등록분)은 원래도 정상 라우팅된다 — 회귀 방지", () => {
    const resolution = okPct("payout", 54.0);
    const props = buildSourcePanelProps("payout", "00258801", "2024", resolution, "PCT", "STANDARD");
    expect(props.requestId).toBe(`alotMatter__00258801__${ALOT_MATTER_REPORT_YEAR}__11011`);
  });
});
