import { formatComma, NULL_PLACEHOLDER } from "./chartUtils";
import type { DisplayState } from "@/lib/normalize/types";

/**
 * OverlaidBars — EPS(바깥) + DPS(안쪽) 겹침 막대 (학습가이드 `epsDiv()` 참조, SET6 "EPS 추이 —
 * 진한 부분 = 그중 배당으로 준 몫"). 같은 x·같은 바닥에서 바깥 막대(EPS, opacity 0.4) 위에
 * 안쪽 막대(DPS, 진한색)를 겹쳐 그린다. 스케일은 바깥(EPS) 값들의 최댓값 기준(학습가이드
 * `epsDiv()`의 `maxV = Math.max(...eps)`와 동일).
 *
 * 승인 규칙 4(배당 0원과 데이터 없음 구분)를 위해 `innerState`로 두 상태를 명시적으로 나눈다:
 * - `innerState === "ZERO_BY_FACT"` → 무배당이 사실로 확인됨 → inner 값과 무관하게 안쪽 막대
 *   높이 0 + "무배당" 칩
 * - `inner === null`(innerState 미지정) → 우리가 못 읽음 → `NULL_PLACEHOLDER`("—") 칩
 * 서버 컴포넌트.
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
  const max = Math.max(1, ...bars.map((b) => (b.outer === null ? 0 : Math.abs(b.outer))));

  return (
    <div data-chart="overlaid-bars">
      <div className="obrow">
        {bars.map((bar) => {
          const outerMissing = bar.outer === null;
          const outerPct = outerMissing ? 0 : Math.round((Math.abs(bar.outer as number) / max) * 100);
          const zeroByFact = bar.innerState === "ZERO_BY_FACT";
          const innerMissing = !zeroByFact && bar.inner === null;
          const innerPct = !zeroByFact && bar.inner !== null ? Math.round((Math.abs(bar.inner) / max) * 100) : 0;

          return (
            <div className="obcol" key={bar.label}>
              <div className="obtrack">
                {outerMissing ? (
                  <div className="obouter empty" style={{ height: "2px" }}>
                    <span className="qbv missing">{NULL_PLACEHOLDER}</span>
                  </div>
                ) : (
                  <div className="obouter" style={{ height: `${outerPct}%` }}>
                    <span className="qbv">{formatComma(bar.outer as number)}</span>
                  </div>
                )}
                {!zeroByFact && !innerMissing && <div className="obinner" style={{ height: `${innerPct}%` }} />}
                {zeroByFact && <span className="obchip">무배당</span>}
                {innerMissing && <span className="obchip muted">{NULL_PLACEHOLDER}</span>}
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
    </div>
  );
}
