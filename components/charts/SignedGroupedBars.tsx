import { CHART_PALETTE } from "./chartUtils";

/**
 * SignedGroupedBars — 0축 기준 n계열 × m기간 발산 막대 (학습가이드 `bars()`의 발산 막대 개념을
 * 다계열로 확장 — SET3 "현금흐름 — 위=유입, 아래=유출"). `ZeroAxisBars`(단일 계열)의 다계열
 * 버전이자, `CashFlowDiverging`(가로·1기간만)과 달리 세로·다기간 비교에 쓴다. 계열 색은
 * `CHART_PALETTE`를 인덱스로 순환 참조.
 *
 * 얇은 막대(9px) n개가 한 기간 슬롯에 나란히 들어가므로 `GroupedBars`와 같은 이유로 막대별
 * 숫자 라벨은 표시하지 않는다(공간 부족으로 인한 겹침 방지) — 막대 높이 비교 + 범례로 값을
 * 전달한다. 서버 컴포넌트.
 */

export type SignedGroupedBarsGroup = {
  label: string;
  /** seriesLabels와 같은 순서·길이. null이면 근거 없는 0 대신 얇은 회색 자리 표시만 한다. */
  values: (number | null)[];
};

export type SignedGroupedBarsProps = {
  groups: SignedGroupedBarsGroup[];
  seriesLabels: string[];
};

export default function SignedGroupedBars({ groups, seriesLabels }: SignedGroupedBarsProps) {
  const defined = groups.flatMap((g) => g.values).filter((v): v is number => v !== null);
  const max = Math.max(1, ...defined.map((v) => Math.abs(v)));

  return (
    <div data-chart="signed-grouped-bars">
      <div className="sgrow">
        {groups.map((g) => (
          <div className="sgcol" key={g.label}>
            <div className="sgtop">
              {g.values.map((v, i) => {
                const missing = v === null;
                const positive = !missing && v >= 0;
                return (
                  <div
                    key={seriesLabels[i] ?? i}
                    className={`sgbar${missing ? " empty" : ""}`}
                    style={{
                      height: missing ? "2px" : positive ? `${Math.round((Math.abs(v as number) / max) * 100)}%` : 0,
                      background: positive ? CHART_PALETTE[i % CHART_PALETTE.length] : undefined,
                    }}
                  />
                );
              })}
            </div>
            <div className="zline" />
            <div className="sgbot">
              {g.values.map((v, i) => {
                const negative = v !== null && v < 0;
                return (
                  <div
                    key={seriesLabels[i] ?? i}
                    className="sgbar"
                    style={{
                      height: negative ? `${Math.round((Math.abs(v as number) / max) * 100)}%` : 0,
                      background: negative ? CHART_PALETTE[i % CHART_PALETTE.length] : undefined,
                    }}
                  />
                );
              })}
            </div>
            <div className="qbx">{g.label}</div>
          </div>
        ))}
      </div>
      <div className="leg">
        {seriesLabels.map((label, i) => (
          <span key={label}>
            <span className="d" style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
