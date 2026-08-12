import { CHART_PALETTE, formatComma, NULL_PLACEHOLDER } from "./chartUtils";

/**
 * StackedBarsAbs — 세로 절대값 누적 막대 (학습가이드 `stacked()` 참조, SET2 "자산 구성 추이 —
 * 아래 초록=자본, 위 빨강=부채"). `StackedBar100`(가로·100% 정규화, T6에서 계속 사용)과 달리
 * 이 컴포넌트는 막대 높이 자체가 합계값이라 기간 간 절대 크기 변화(자산이 커졌는지)가 그대로
 * 보인다. 스케일은 전 기간 중 합계 최댓값 기준 공통 스케일(학습가이드 `maxV`와 같은 원리).
 *
 * 세그먼트는 2개로 고정하지 않고 n개를 허용한다 — DOM 순서 그대로 아래→위로 쌓으므로(자본을
 * `segments[0]`에, 부채를 마지막에 두면 학습가이드와 동일한 배치가 된다). null 세그먼트는
 * 스택·합계에서 제외한다(근거 없는 0 금지). 서버 컴포넌트.
 */

export type StackedBarsAbsSegment = {
  label: string;
  /** null이면 근거 없는 0 대신 스택·합계에서 제외한다. */
  value: number | null;
};

export type StackedBarsAbsBar = {
  label: string;
  /** 아래→위로 쌓이는 순서. 예: [{label:"자본",...}, {label:"부채",...}]. */
  segments: StackedBarsAbsSegment[];
};

export type StackedBarsAbsProps = {
  bars: StackedBarsAbsBar[];
};

export default function StackedBarsAbs({ bars }: StackedBarsAbsProps) {
  // 세그먼트 라벨 -> 색 매핑: 등장 순서 기준으로 고정해 전 막대에서 같은 라벨이 같은 색을 쓰게 한다.
  const allLabels = Array.from(new Set(bars.flatMap((b) => b.segments.map((s) => s.label))));
  const colorByLabel = new Map(allLabels.map((label, i) => [label, CHART_PALETTE[i % CHART_PALETTE.length]]));

  const totals = bars.map((b) => b.segments.reduce((sum, s) => sum + (s.value ?? 0), 0));
  const max = Math.max(1, ...totals);

  return (
    <div data-chart="stacked-bars-abs">
      <div className="sbarow">
        {bars.map((bar, bi) => {
          const defined = bar.segments.filter((s): s is { label: string; value: number } => s.value !== null);
          const total = totals[bi];
          return (
            <div className="sbacol" key={bar.label}>
              <div className="sbatrack">
                {defined.length > 0 ? (
                  <div className="sbastack" style={{ height: `${Math.round((total / max) * 100)}%` }}>
                    <span className="qbv">{formatComma(total)}</span>
                    {defined.map((s) => (
                      <div
                        key={s.label}
                        className="sbaseg"
                        style={{ height: `${(s.value / total) * 100}%`, background: colorByLabel.get(s.label) }}
                        title={`${s.label} ${formatComma(s.value)}`}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="sbastack empty" style={{ height: "2px" }}>
                    <span className="qbv missing">{NULL_PLACEHOLDER}</span>
                  </div>
                )}
              </div>
              <div className="qbx">{bar.label}</div>
            </div>
          );
        })}
      </div>
      <div className="leg">
        {allLabels.map((label) => (
          <span key={label}>
            <span className="d" style={{ background: colorByLabel.get(label) }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
