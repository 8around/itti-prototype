import { describe, expect, it } from "vitest";

import { niceDomain, padDomain, splitLineRuns } from "./rechartsPrimitives";

/**
 * `splitLineRuns`의 M5 회귀 테스트 — `chartUtils.buildLineRuns`(V1까지, 픽셀 x/y 입력)에서
 * `rechartsPrimitives.splitLineRuns`(V2, 행+판정 함수 입력, 인덱스 구간 출력)로 이전하면서
 * 로직은 그대로 옮기고 입력·출력 형태만 일반화했다(실측 결과 부분집합 `data`를 가진 `<Line>`을
 * run마다 두면 Recharts가 XAxis 라벨을 `<Line>` 개수만큼 중복 렌더링해 인덱스 구간 방식으로
 * 바꿨다 — `LineChart.tsx`·`splitLineRuns` doc 참고). 실제로 화면을 틀리게 만들었던 8분기
 * 윈도의 Q4 두 개 케이스를 그대로 쓴다(과거 chartUtils.test.ts의 buildLineRuns describe 블록을
 * 이 시그니처로 포팅).
 */
type Row = { provisional: boolean; drawable: boolean };

function row(provisional = false, drawable = true): Row {
  return { provisional, drawable };
}

const isDrawable = (r: Row) => r.drawable;
const isProvisional = (r: Row) => r.provisional;

describe("splitLineRuns — 구간별 점선 판정(M5)", () => {
  const rows = Array.from({ length: 8 }, () => row());

  it("잠정 지점이 없으면 전 구간이 하나의 실선 run", () => {
    const runs = splitLineRuns(rows, isDrawable, isProvisional);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual({ startIndex: 0, endIndex: 7, dashed: false });
  });

  it("8분기 윈도에 Q4가 둘이면 각 Q4 주변만 점선 — 사이의 확정 구간은 실선으로 남는다", () => {
    // 인덱스 2·6이 Q4(잠정). 예전 로직은 인덱스 2 이후 끝까지 전부 점선으로 칠했다.
    const withQ4 = rows.map((_, i) => row(i === 2 || i === 6));
    const runs = splitLineRuns(withQ4, isDrawable, isProvisional);
    expect(runs).toEqual([
      { startIndex: 0, endIndex: 1, dashed: false }, // 확정 구간
      { startIndex: 1, endIndex: 3, dashed: true }, // Q4(인덱스 2)에 닿는 두 구간
      { startIndex: 3, endIndex: 5, dashed: false }, // 사이의 확정 구간 — 예전에는 여기까지 점선으로 오염됐다
      { startIndex: 5, endIndex: 7, dashed: true }, // Q4(인덱스 6)에 닿는 두 구간
    ]);
  });

  it("run 경계는 인덱스를 공유해 선에 틈이 생기지 않는다", () => {
    const withQ4 = rows.map((_, i) => row(i === 2 || i === 6));
    const runs = splitLineRuns(withQ4, isDrawable, isProvisional);
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].startIndex).toBe(runs[i - 1].endIndex);
    }
  });

  it("그릴 수 없는(missing/state) 지점에서는 run을 끊는다(점 하나만 남는 구간은 버린다)", () => {
    const withGap = [row(), row(false, false), row(), row()];
    const runs = splitLineRuns(withGap, isDrawable, isProvisional);
    expect(runs).toEqual([{ startIndex: 2, endIndex: 3, dashed: false }]);
  });

  it("마지막 지점만 잠정이면 마지막 구간만 점선", () => {
    const withLastQ4 = rows.map((_, i) => row(i === 7));
    const runs = splitLineRuns(withLastQ4, isDrawable, isProvisional);
    expect(runs).toEqual([
      { startIndex: 0, endIndex: 6, dashed: false },
      { startIndex: 6, endIndex: 7, dashed: true },
    ]);
  });

  it("그릴 수 있는 행이 1개 이하면 run이 하나도 생기지 않는다", () => {
    expect(splitLineRuns([row()], isDrawable, isProvisional)).toHaveLength(0);
    expect(splitLineRuns([], isDrawable, isProvisional)).toHaveLength(0);
  });
});

describe("padDomain — 0을 지나는 도메인의 nice-round(V1, 회귀 확인용)", () => {
  it("여전히 하단을 0에 고정하고 상단만 올림한다", () => {
    expect(padDomain([0, 938373])).toEqual([0, 1_000_000]);
  });
});

describe("niceDomain — 0을 지나지 않아도 되는 양방향 도메인(V2, LineChart 전용)", () => {
  it("전 구간 양수(ROE류)에서도 하단을 0에 붙이지 않고 데이터 쪽으로 내림한다", () => {
    const [lo, hi] = niceDomain([7.625, 12.875]);
    expect(lo).toBe(5);
    expect(hi).toBe(20);
    expect(lo).toBeGreaterThan(0);
  });

  it("baseline이 데이터에서 먼 경우(부채비율)에도 baseline 쪽 끝은 정확히 보존한다", () => {
    // LineChart가 [23.75, 100](데이터 25%~30% + 25% 여백, baseline 100 union) 형태로 넘기는 값.
    const [lo, hi] = niceDomain([23.75, 100]);
    expect(lo).toBeLessThanOrEqual(23.75);
    expect(hi).toBe(100);
  });

  it("음수를 포함하는 도메인도 양방향으로 올바르게 반올림한다", () => {
    expect(niceDomain([-118, 12])).toEqual([-200, 20]);
  });

  it("min===max(포인트 1개)여도 0으로 나누지 않고 유효한 span을 만든다", () => {
    const [lo, hi] = niceDomain([10, 10]);
    expect(hi).toBeGreaterThan(lo);
  });

  it("min===max===0이어도 유효한 span을 만든다", () => {
    const [lo, hi] = niceDomain([0, 0]);
    expect(hi).toBeGreaterThan(lo);
  });
});
