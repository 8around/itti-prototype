import { formatComma, NULL_PLACEHOLDER } from "./chartUtils";

/**
 * PnlWaterfall — 손익 구조 워터폴 (목업 `.wf/.wfrow`, 화면 ⑥ "손익 구조").
 * 매출을 100%로 두고 각 단계(매출총이익·영업이익·순이익 등)의 막대 폭 = `ratioPct`,
 * 우측에 절대값과 비율을 함께 표기한다. 서버 컴포넌트.
 */

export type PnlWaterfallRow = {
  label: string;
  /** 억원 등 절대값. null이면 근거 없는 0 대신 자리 표시만 한다. */
  value: number | null;
  /** 매출 대비 비율(%). null이면 막대를 그리지 않는다. */
  ratioPct: number | null;
};

export type PnlWaterfallProps = {
  rows: PnlWaterfallRow[];
};

export default function PnlWaterfall({ rows }: PnlWaterfallProps) {
  return (
    <div className="wf" data-chart="pnl-waterfall">
      {rows.map((row) => {
        const missing = row.value === null || row.ratioPct === null;
        const widthPct = missing ? 0 : Math.max(0, Math.min(100, row.ratioPct as number));
        return (
          <div className="wfrow" key={row.label}>
            <span className="wl">{row.label}</span>
            <span className="wbar">
              <i className={missing ? "empty" : undefined} style={{ width: missing ? "2px" : `${widthPct}%` }} />
            </span>
            <span className="wv">{missing ? NULL_PLACEHOLDER : formatComma(row.value as number)}</span>
            <span className="wm">{missing ? NULL_PLACEHOLDER : `${(row.ratioPct as number).toFixed(1)}%`}</span>
          </div>
        );
      })}
    </div>
  );
}
