import { chartDigits, formatChartValue, NULL_PLACEHOLDER } from "./chartUtils";

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
  const digits = chartDigits(bars.map((b) => b.value));
  // 전 구간 흑자면 기준선 아래 구획이 통째로 빈 여백이 된다 — 트랙을 키우고 나서 이 공백이
  // 눈에 띄게 커졌다. 음수가 하나도 없을 때만 아래 구획을 얇게 접는다(기준선 자체는 유지 —
  // "0을 기준으로 본다"는 이 차트의 의미가 사라지면 안 되므로).
  const hasNegative = bars.some((b) => b.value !== null && b.value < 0);

  return (
    <div className={`zbrow${hasNegative ? "" : " noneg"}`} data-chart="zero-axis-bars">
      {bars.map((bar) => {
        const missing = bar.value === null;
        const negative = !missing && (bar.value as number) < 0;
        const heightPct = missing ? 0 : Math.round((Math.abs(bar.value as number) / max) * 100);
        return (
          <div className="zbcol" key={bar.label}>
            <div className="zbtop">
              {!missing && !negative && (
                <div className="zbf" style={{ height: `${heightPct}%` }}>
                  <span className="qbv">{formatChartValue(bar.value as number, digits)}</span>
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
                  <span className="qbv down">{formatChartValue(bar.value as number, digits)}</span>
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
