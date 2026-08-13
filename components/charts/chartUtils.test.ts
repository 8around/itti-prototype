import { describe, expect, it } from "vitest";

import { buildLineRuns, SIGNED_AXIS_TOTAL_PX, signedAxisScale } from "./chartUtils";

/**
 * 최종 리뷰 픽스(I1·M5)의 회귀 테스트. 두 헬퍼 다 순수 함수라 렌더링 없이 고정할 수 있고,
 * 실제로 화면을 틀리게 만들었던 값(삼성전자 현금흐름, 8분기 윈도의 Q4 두 개)을 그대로 쓴다.
 */

describe("signedAxisScale — 0축 위/아래 px per unit 대칭(I1)", () => {
  it("크기가 같은 +100과 −100은 같은 높이로 그려진다", () => {
    const scale = signedAxisScale([100, -100]);
    expect(scale.heightPx(100)).toBe(scale.heightPx(-100));
    expect(scale.topPx).toBe(scale.botPx);
  });

  it("삼성전자 24년 현금흐름 — 유출(−85.38조)이 유입(+72.98조)보다 크게 그려진다", () => {
    // 예전 고정 분할(위 56px·아래 26px)에서는 영업 47.6px vs 투자 26px로 순위가 뒤집혔다.
    const operating = 72.98e12;
    const investing = -85.38e12;
    const scale = signedAxisScale([operating, investing, -11.7e12]);
    expect(scale.heightPx(investing)).toBeGreaterThan(scale.heightPx(operating));
    // 높이 비 = 값 크기 비 (같은 배율이라는 뜻).
    expect(scale.heightPx(investing) / scale.heightPx(operating)).toBeCloseTo(85.38 / 72.98, 10);
  });

  it("최대 양수·최대 음수 막대는 각자 영역을 정확히 채우고 총 높이는 항상 일정하다", () => {
    const scale = signedAxisScale([30, -10, 5, null]);
    expect(scale.heightPx(30)).toBeCloseTo(scale.topPx, 10);
    expect(scale.heightPx(-10)).toBeCloseTo(scale.botPx, 10);
    expect(scale.topPx + scale.botPx).toBeCloseTo(SIGNED_AXIS_TOTAL_PX, 10);
  });

  it("전부 양수면 아래 영역이 0이 되어 기준선이 바닥에 놓인다", () => {
    const scale = signedAxisScale([10, 20, 30]);
    expect(scale.botPx).toBe(0);
    expect(scale.topPx).toBe(SIGNED_AXIS_TOTAL_PX);
  });

  it("전부 null이거나 전부 0이어도 0으로 나누지 않는다", () => {
    for (const values of [[null, null], [0, 0], []]) {
      const scale = signedAxisScale(values);
      expect(scale.topPx + scale.botPx).toBe(SIGNED_AXIS_TOTAL_PX);
      expect(scale.heightPx(0)).toBe(0);
    }
  });
});

describe("buildLineRuns — 지점별 점선 판정(M5)", () => {
  const xs = [0, 1, 2, 3, 4, 5, 6, 7];
  const ys = [10, 11, 12, 13, 14, 15, 16, 17];

  it("잠정 지점이 없으면 전 구간이 하나의 실선 run", () => {
    const runs = buildLineRuns(xs, ys, xs.map(() => false));
    expect(runs).toHaveLength(1);
    expect(runs[0].dashed).toBe(false);
    expect(runs[0].pts).toHaveLength(8);
  });

  it("8분기 윈도에 Q4가 둘이면 각 Q4 주변만 점선 — 사이의 확정 구간은 실선으로 남는다", () => {
    // 인덱스 2·6이 Q4(잠정). 예전 로직은 인덱스 2 이후 끝까지 전부 점선으로 칠했다.
    const provisional = [false, false, true, false, false, false, true, false];
    const runs = buildLineRuns(xs, ys, provisional);
    expect(runs.map((r) => [r.pts[0].x, r.pts.at(-1)!.x, r.dashed])).toEqual([
      [0, 1, false], // 확정 구간
      [1, 3, true], // Q4(인덱스 2)에 닿는 두 구간
      [3, 5, false], // 사이의 확정 구간 — 예전에는 여기까지 점선으로 오염됐다
      [5, 7, true], // Q4(인덱스 6)에 닿는 두 구간
    ]);
  });

  it("run 경계는 꼭짓점을 공유해 선에 틈이 생기지 않는다", () => {
    const runs = buildLineRuns(xs, ys, [false, false, true, false, false, false, true, false]);
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].pts[0]).toEqual(runs[i - 1].pts.at(-1));
    }
  });

  it("값이 null인 지점에서는 run을 끊는다(점 하나만 남는 구간은 버린다)", () => {
    const runs = buildLineRuns([0, 1, 2, 3], [10, null, 12, 13], [false, false, false, false]);
    expect(runs).toHaveLength(1);
    expect(runs[0].pts).toEqual([
      { x: 2, y: 12 },
      { x: 3, y: 13 },
    ]);
  });

  it("마지막 지점만 잠정이면 마지막 구간만 점선", () => {
    const runs = buildLineRuns(xs, ys, [false, false, false, false, false, false, false, true]);
    expect(runs).toHaveLength(2);
    expect(runs[0].dashed).toBe(false);
    expect(runs[1]).toMatchObject({ dashed: true });
    expect(runs[1].pts).toHaveLength(2);
  });
});
