/**
 * GroupedBars — 2계열 그룹 막대 (목업 `.bars/.bar-a/.bar-b`, 화면 ⑥ "손익 추이" 매출+영업이익).
 * 두 계열을 공통 스케일(전체 최댓값)로 그리고 하단에 범례를 붙인다. 서버 컴포넌트.
 */

export type GroupedBarsGroup = {
  label: string;
  /** null이면 근거 없는 0 대신 자리 표시만 하고 막대를 그리지 않는다. */
  a: number | null;
  b: number | null;
};

export type GroupedBarsProps = {
  groups: GroupedBarsGroup[];
  seriesLabels: [string, string];
};

export default function GroupedBars({ groups, seriesLabels }: GroupedBarsProps) {
  const values = groups.flatMap((g) => [g.a, g.b]).filter((v): v is number => v !== null);
  const max = Math.max(1, ...values);

  return (
    <div data-chart="grouped-bars">
      <div className="bars">
        {groups.map((g) => (
          <div className="bcol" key={g.label}>
            <div className="bwrap">
              {g.a === null ? (
                <div className="bar-a empty" style={{ height: "2px" }} />
              ) : (
                <div className="bar-a" style={{ height: `${Math.round((g.a / max) * 100)}%` }} />
              )}
              {g.b === null ? (
                <div className="bar-b empty" style={{ height: "2px" }} />
              ) : (
                <div className="bar-b" style={{ height: `${Math.round((g.b / max) * 100)}%` }} />
              )}
            </div>
            <div className="blabel">{g.label}</div>
          </div>
        ))}
      </div>
      <div className="leg">
        <span>
          <span className="d" style={{ background: "var(--green)" }} />
          {seriesLabels[0]}
        </span>
        <span>
          <span className="d" style={{ background: "var(--green-bd)" }} />
          {seriesLabels[1]}
        </span>
      </div>
    </div>
  );
}
