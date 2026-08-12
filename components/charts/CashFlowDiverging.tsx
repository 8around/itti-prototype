import { chartDigits, formatChartValue, NULL_PLACEHOLDER } from "./chartUtils";

/**
 * CashFlowDiverging — 현금흐름 발산 막대 (목업 `.flowrow/.fill.pos|.neg`, 화면 ⑥ "현금흐름").
 * 트랙 중앙이 0, 양수는 오른쪽(`--green`)·음수는 왼쪽(연한 청색)으로 뻗는다. 폭은 행 중
 * 절댓값 최댓값을 트랙 절반(50%)에 맞춘 공통 스케일. 서버 컴포넌트.
 */

export type CashFlowRow = {
  label: string;
  /** null이면 근거 없는 0 대신 자리 표시만 한다. */
  value: number | null;
};

export type CashFlowDivergingProps = {
  rows: CashFlowRow[];
};

export default function CashFlowDiverging({ rows }: CashFlowDivergingProps) {
  const max = Math.max(1, ...rows.map((r) => (r.value === null ? 0 : Math.abs(r.value))));
  const digits = chartDigits(rows.map((r) => r.value));

  return (
    <div data-chart="cash-flow-diverging">
      {rows.map((row) => {
        const missing = row.value === null;
        const negative = !missing && (row.value as number) < 0;
        const widthPct = missing ? 0 : Math.round((Math.abs(row.value as number) / max) * 50);
        return (
          <div className="flowrow" key={row.label}>
            <span className="fl">{row.label}</span>
            <span className="track">
              {!missing && (
                <span
                  className={`fill ${negative ? "neg" : "pos"}`}
                  style={{ width: `${widthPct}%` }}
                />
              )}
            </span>
            <span className={`fv${missing ? "" : negative ? " down" : " up"}`}>
              {missing ? NULL_PLACEHOLDER : `${negative ? "" : "+"}${formatChartValue(row.value as number, digits)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
