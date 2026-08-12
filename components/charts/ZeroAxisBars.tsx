import { formatComma, NULL_PLACEHOLDER } from "./chartUtils";

/**
 * ZeroAxisBars — 0 기준선 발산 막대 (목업 `.zbrow/.zbtop/.zbbot/.zline`, 화면 ④ "순이익").
 * 적자 종목처럼 음수가 나올 수 있는 지표용 — 양수는 기준선 위(`.zbtop`), 음수는 아래
 * (`.zbbot`, 청색계)로 그린다. 절댓값 기준 공통 스케일. 서버 컴포넌트.
 */

export type ZeroAxisBar = {
  label: string;
  /** null이면 근거 없는 0 대신 자리 표시만 한다. */
  value: number | null;
};

export type ZeroAxisBarsProps = {
  bars: ZeroAxisBar[];
};

export default function ZeroAxisBars({ bars }: ZeroAxisBarsProps) {
  const max = Math.max(1, ...bars.map((b) => (b.value === null ? 0 : Math.abs(b.value))));

  return (
    <div className="zbrow" data-chart="zero-axis-bars">
      {bars.map((bar) => {
        const missing = bar.value === null;
        const negative = !missing && (bar.value as number) < 0;
        const heightPct = missing ? 0 : Math.round((Math.abs(bar.value as number) / max) * 100);
        return (
          <div className="zbcol" key={bar.label}>
            <div className="zbtop">
              {!missing && !negative && (
                <div className="zbf" style={{ height: `${heightPct}%` }}>
                  <span className="qbv">{formatComma(bar.value as number)}</span>
                </div>
              )}
              {missing && (
                <div className="zbf empty" style={{ height: "2px" }}>
                  <span className="qbv missing">{NULL_PLACEHOLDER}</span>
                </div>
              )}
            </div>
            <div className="zline" />
            <div className="zbbot">
              {negative && (
                <div className="zbf" style={{ height: `${heightPct}%` }}>
                  <span className="qbv down">{formatComma(bar.value as number)}</span>
                </div>
              )}
            </div>
            <div className="qbx">{bar.label}</div>
          </div>
        );
      })}
    </div>
  );
}
