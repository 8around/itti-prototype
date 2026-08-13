import { formatComma, NULL_PLACEHOLDER, px, signedAxisScale } from "./chartUtils";
import type { DisplayState } from "@/lib/normalize/types";

/**
 * OverlaidBars — EPS(바깥) + DPS(안쪽) 겹침 막대 (학습가이드 `epsDiv()` 참조, SET6 "EPS 추이 —
 * 진한 부분 = 그중 배당으로 준 몫"). 흑자 연도에는 같은 x·같은 바닥에서 바깥 막대(EPS,
 * opacity 0.4) 위에 안쪽 막대(DPS, 진한색)를 겹쳐 그린다.
 *
 * 승인 규칙 4(배당 0원과 데이터 없음 구분)를 위해 `innerState`로 두 상태를 명시적으로 나눈다:
 * - `innerState === "ZERO_BY_FACT"` → 무배당이 사실로 확인됨 → inner 값과 무관하게 안쪽 막대
 *   높이 0 + "무배당" 칩
 * - `inner === null`(innerState 미지정) → 우리가 못 읽음 → `NULL_PLACEHOLDER`("—") 칩
 * 서버 컴포넌트.
 *
 * 최종 리뷰 픽스(C2) — 0축 도입. 예전에는 0축이 없어 모든 막대가 바닥에서 위로만 자랐고 높이가
 * `Math.abs(outer)` 비율이라 **음수 EPS가 절대값 크기로 위로** 그려졌다(승인 규칙 2 정면 위반).
 * LG화학 ⑦ 주주환원 실측: 23년 +17,086원(74%) / 24년 −8,826원(38%) / 25년 −23,244원(100%, 차트
 * 최고) — 실제 최악의 해가 시각적으로 최고 실적이 됐다. 이제 `ZeroAxisBars`와 같은 2단 구조
 * (`.obtop`/`.zline`/`.obbot`)를 쓰고 음수는 기준선 아래로 그린다.
 *
 * 적자 연도의 DPS는 **겹치지 않고 기준선 위에 따로** 그린다 — "EPS 중 배당으로 준 몫"이라는 범례가
 * 손실 막대 안에서는 성립하지 않기 때문이다(적자인데 배당은 했다는 사실 자체는 그대로 보여준다).
 * 위/아래 배율은 `signedAxisScale`이 맞춘다(I1).
 */

export type OverlaidBar = {
  label: string;
  /** 바깥 막대 값(예: EPS). null이면 근거 없는 0 대신 자리 표시만 한다. */
  outer: number | null;
  /** 안쪽 막대 값(예: DPS). */
  inner: number | null;
  /** "ZERO_BY_FACT"면 inner 값과 무관하게 높이 0 + "무배당" 칩으로 그린다. */
  innerState?: DisplayState;
};

export type OverlaidBarsProps = {
  bars: OverlaidBar[];
  /** 바깥 막대 범례 라벨 (예: "EPS"). */
  outerLabel: string;
  /** 안쪽 막대 범례 라벨 (예: "DPS"). */
  innerLabel: string;
};

export default function OverlaidBars({ bars, outerLabel, innerLabel }: OverlaidBarsProps) {
  // ZERO_BY_FACT(무배당)는 값과 무관하게 안쪽 막대를 그리지 않으므로 스케일 계산에서도 뺀다.
  const innerValues = bars.map((b) => (b.innerState === "ZERO_BY_FACT" ? null : b.inner));
  // 안쪽(DPS)도 같은 자로 그려야 "EPS 중 배당으로 준 몫"이라는 범례가 성립한다 — 배당성향이
  // 100%를 넘어 DPS가 최대 EPS보다 큰 해가 있어도 잘리지 않도록 도메인에 함께 넣는다.
  const scale = signedAxisScale([...bars.map((b) => b.outer), ...innerValues]);
  const hasLossYearDividend = bars.some((b, i) => b.outer !== null && b.outer < 0 && (innerValues[i] ?? 0) > 0);
  const hasNegative = bars.some((b) => b.outer !== null && b.outer < 0);

  return (
    <div data-chart="overlaid-bars">
      <div className={`obrow${hasNegative ? " hasneg" : ""}`}>
        {bars.map((bar, i) => {
          const outerMissing = bar.outer === null;
          const outerNegative = !outerMissing && (bar.outer as number) < 0;
          const outerHeight = outerMissing ? 0 : scale.heightPx(bar.outer as number);
          const zeroByFact = bar.innerState === "ZERO_BY_FACT";
          const inner = innerValues[i];
          const innerMissing = !zeroByFact && inner === null;

          return (
            <div className="obcol" key={bar.label}>
              <div className="obtrack">
                <div className="obtop" style={{ height: px(scale.topPx) }}>
                  {outerMissing && (
                    <div className="obouter empty" style={{ height: "2px" }}>
                      <span className="qbv missing">{NULL_PLACEHOLDER}</span>
                    </div>
                  )}
                  {!outerMissing && !outerNegative && (
                    <div className="obouter" style={{ height: px(outerHeight) }}>
                      <span className="qbv">{formatComma(bar.outer as number)}</span>
                    </div>
                  )}
                  {inner !== null && (
                    <div className={`obinner${outerNegative ? " solo" : ""}`} style={{ height: px(scale.heightPx(inner)) }} />
                  )}
                  {zeroByFact && <span className="obchip">무배당</span>}
                  {innerMissing && <span className="obchip muted">{NULL_PLACEHOLDER}</span>}
                </div>
                <div className="zline" />
                <div className="obbot" style={{ height: px(scale.botPx) }}>
                  {outerNegative && (
                    <div className="obouter neg" style={{ height: px(outerHeight) }}>
                      <span className="qbv neg">{formatComma(bar.outer as number)}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="qbx">{bar.label}</div>
            </div>
          );
        })}
      </div>
      <div className="leg">
        <span>
          <span className="d" style={{ background: "var(--green)", opacity: 0.4 }} />
          {outerLabel}
        </span>
        <span>
          <span className="d" style={{ background: "var(--green)" }} />
          {innerLabel}
        </span>
      </div>
      {hasLossYearDividend && <div className="cnote">적자 연도의 {innerLabel}는 {outerLabel} 막대에 겹치지 않고 기준선 위에 따로 표시</div>}
    </div>
  );
}
