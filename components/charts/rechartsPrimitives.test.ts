import { describe, expect, it } from "vitest";

import { lineDomain, niceDomain, padDomain, splitLineRuns } from "./rechartsPrimitives";

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

/**
 * V6 — 1/2/5 사다리를 도메인 **경계**가 아니라 눈금 **간격**에 적용하도록 바꾼 뒤의 계약.
 * 종전 구현은 경계를 사다리에 스냅해 도메인이 최대 5배 부풀었고(POSCO홀딩스 부채비율 3.3px =
 * 육안 평선), 그 대가로 얻기로 한 "깔끔한 눈금"은 Recharts가 양 끝만 고정한 채 균등 분할하는
 * 탓에 실제로는 나오지도 않았다. 그래서 `tickCount`를 함께 반환한다.
 */
const spanOf = ({ domain }: { domain: [number, number] }) => domain[1] - domain[0];
/** 도메인 스팬이 눈금 간격의 정확한 배수인가 — 이게 성립해야 Recharts 균등 분할이 step 배수에 떨어진다. */
function stepOf(scale: { domain: [number, number]; tickCount: number }): number {
  return spanOf(scale) / (scale.tickCount - 1);
}

describe("padDomain — 0을 지나는 발산 막대 축", () => {
  it("데이터가 도메인의 절반 이상을 쓴다 — 종전에는 938,373이 [0, 1,000,000]으로 부풀었다", () => {
    const scale = padDomain([0, 938_373]);
    expect(scale.domain[0]).toBe(0);
    expect(scale.domain[1]).toBeGreaterThanOrEqual(938_373);
    expect(938_373 / spanOf(scale)).toBeGreaterThan(0.55);
  });

  it("0을 항상 포함하고, 0이 눈금 자리와 정확히 겹친다 — 승인규칙 ①이 격자에서도 지켜진다", () => {
    for (const values of [
      [-853_800, 729_800],
      [0, 21_200],
      [-1_237, -600],
      [12, 55],
    ] as [number, number][]) {
      const scale = padDomain(values);
      expect(scale.domain[0]).toBeLessThanOrEqual(0);
      expect(scale.domain[1]).toBeGreaterThanOrEqual(0);
      // 0 = domain[0] + k*step 인 정수 k가 존재한다.
      const k = -scale.domain[0] / stepOf(scale);
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
    }
  });

  it("위/아래 px-per-unit 대칭 — 도메인이 선형이라 0 위아래 단위당 픽셀이 같다(승인규칙 ①)", () => {
    // 삼성전자 24년 현금흐름(억원): 영업 +729,800 / 투자 −853,800.
    const { domain } = padDomain([-853_800, 729_800]);
    const plot = 200;
    const perUnit = plot / (domain[1] - domain[0]);
    expect(Math.abs(729_800 * perUnit - (729_800 / (domain[1] - domain[0])) * plot)).toBeLessThan(1e-9);
    expect(domain[0]).toBeLessThanOrEqual(-853_800);
    expect(domain[1]).toBeGreaterThanOrEqual(729_800);
  });

  it("전부 결측이라 [0,0]으로 들어와도 스팬이 0이 되지 않는다", () => {
    const scale = padDomain([0, 0]);
    expect(spanOf(scale)).toBeGreaterThan(0);
    expect(scale.domain[0]).toBe(0);
  });
});

describe("niceDomain — 0을 지나지 않아도 되는 양방향 축", () => {
  it("전 구간 양수(ROE류)에서 하단을 0에 붙이지 않고, 데이터가 도메인의 절반 이상을 쓴다", () => {
    const scale = niceDomain([7.625, 12.875]);
    expect(scale.domain[0]).toBeGreaterThan(0);
    expect(scale.domain[0]).toBeLessThanOrEqual(7.625);
    expect(scale.domain[1]).toBeGreaterThanOrEqual(12.875);
    expect(5.25 / spanOf(scale)).toBeGreaterThan(0.55);
  });

  it("음수를 포함하는 도메인도 양방향으로 경계를 맞춘다", () => {
    const scale = niceDomain([-118, 12]);
    expect(scale.domain[0]).toBeLessThanOrEqual(-118);
    expect(scale.domain[1]).toBeGreaterThanOrEqual(12);
    expect(130 / spanOf(scale)).toBeGreaterThan(0.55);
  });

  it("min===max(포인트 1개)여도 0으로 나누지 않고 유효한 span을 만든다", () => {
    expect(spanOf(niceDomain([10, 10]))).toBeGreaterThan(0);
    expect(spanOf(niceDomain([0, 0]))).toBeGreaterThan(0);
  });

  it("경계가 언제나 눈금 간격의 배수이고 눈금은 3~6개다 — Recharts 균등 분할이 딱 떨어지게 하는 계약", () => {
    const inputs: [number, number][] = [
      [7.625, 12.875],
      [23.75, 100],
      [-118, 12],
      [68.04, 69.42],
      [1109.9, 1220.3],
      [0, 938_373],
      [-853_800, 729_800],
      [0.0031, 0.0047],
    ];
    for (const input of inputs) {
      const scale = niceDomain(input);
      const step = stepOf(scale);
      expect(scale.tickCount).toBeGreaterThanOrEqual(3);
      expect(scale.tickCount).toBeLessThanOrEqual(6);
      for (const edge of scale.domain) {
        const k = edge / step;
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
      }
      expect(scale.domain[0]).toBeLessThanOrEqual(input[0]);
      expect(scale.domain[1]).toBeGreaterThanOrEqual(input[1]);
    }
  });
});

describe("lineDomain — 꺾은선 축(데이터 여백 + 기준선 포함 판정)", () => {
  /** 180px 플롯에서 데이터가 차지하는 세로 픽셀. */
  const spanPx = (values: number[], baseline?: number) => {
    const scale = lineDomain(values, baseline);
    return ((Math.max(...values) - Math.min(...values)) / (scale.domain[1] - scale.domain[0])) * 180;
  };

  it("POSCO홀딩스 부채비율 — 기준선 100%를 빼고 데이터 해상도를 택한다(3.3px → 100px 이상)", () => {
    const values = [69.19, 68.27, 68.64];
    const scale = lineDomain(values, 100);
    expect(scale.baselineInDomain).toBe(false);
    expect(scale.domain[1]).toBeLessThan(100);
    expect(spanPx(values, 100)).toBeGreaterThan(100);
  });

  it("리뷰가 지목한 평선 4종이 전부 20px 이상으로 살아난다", () => {
    // [값들, 기준선, 종전 스팬(px)] — review-A-rules.md §2 Important-1 실측표.
    const cases: [number[], number, number][] = [
      [[69.19, 68.27, 68.64], 100, 3.3],
      [[127.28, 125.66, 129.1], 100, 6.2],
      [[1128.29, 1157.65, 1201.94], 100, 7.0],
      [[1115.73, 1166.98, 1211.73], 100, 9.1],
      [[25.36, 27.93, 29.94], 100, 10.3],
      [[81.69, 84.85, 82.49], 100, 11.4],
      [[47.45, 41.36, 41.9], 100, 13.7],
    ];
    for (const [values, baseline] of cases) expect(spanPx(values, baseline)).toBeGreaterThan(20);
  });

  it("기준선이 데이터 근처면 종전대로 도메인에 넣는다 — 0% 기준선(YoY)은 사라지지 않는다", () => {
    expect(lineDomain([10, 30, 22], 0).baselineInDomain).toBe(true);
    expect(lineDomain([-12, 30, 22], 0).baselineInDomain).toBe(true);
    // KB금융 ROE처럼 기준선이 아예 없는 경우.
    expect(lineDomain([8.08, 8.49, 9.68]).baselineInDomain).toBe(false);
    expect(spanPx([8.08, 8.49, 9.68])).toBeGreaterThan(60);
  });

  it("그릴 수 있는 값이 0개(전 구간 전환 상태)여도 기준선 주변으로 유효한 축을 만든다", () => {
    const scale = lineDomain([], 0);
    expect(scale.domain[1]).toBeGreaterThan(scale.domain[0]);
    expect(scale.baselineInDomain).toBe(true);
  });
});
