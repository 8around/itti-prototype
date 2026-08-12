import { formatComma, NULL_PLACEHOLDER } from "./chartUtils";

/**
 * QuarterBars — 분기 실적 세로 막대 (목업 `.qbrow/.qbcol/.qbfill(.prov)`, 화면 ③④ "매출액/영업이익").
 * 최댓값 기준으로 높이를 스케일하고, `provisional`(4Q 역산 등 잠정치)은 주황 점선 + "잠정" 칩으로
 * 구분한다. 서버 컴포넌트.
 */

export type QuarterBar = {
  label: string;
  /** null이면 근거 없는 0 대신 자리 표시만 하고 막대를 그리지 않는다. */
  value: number | null;
  /** 확정 전 잠정치(예: 4Q = 사업보고서 누계 − 3Q 누계 역산) 여부. */
  provisional?: boolean;
};

export type QuarterBarsProps = {
  bars: QuarterBar[];
  unit: string;
};

export default function QuarterBars({ bars, unit }: QuarterBarsProps) {
  const max = Math.max(1, ...bars.map((b) => (b.value === null ? 0 : Math.abs(b.value))));

  return (
    <div data-chart="quarter-bars">
      <div className="qb-unit">{unit}</div>
      <div className="qbrow">
        {bars.map((bar) => {
          const missing = bar.value === null;
          const heightPct = missing ? 0 : Math.round((Math.abs(bar.value as number) / max) * 100);
          return (
            <div className="qbcol" key={bar.label}>
              <div className="qbtrack">
                {missing ? (
                  <div className="qbfill empty" style={{ height: "2px" }}>
                    <span className="qbv missing">{NULL_PLACEHOLDER}</span>
                  </div>
                ) : (
                  <div className={`qbfill${bar.provisional ? " prov" : ""}`} style={{ height: `${heightPct}%` }}>
                    <span className={`qbv${bar.provisional ? " prov" : ""}`}>{formatComma(bar.value as number)}</span>
                  </div>
                )}
              </div>
              <div className="qbx">
                {bar.label}
                {bar.provisional && <span className="pchip">잠정</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
