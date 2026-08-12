import { CHART_PALETTE, chartDigits, formatChartValue, formatPct1, NULL_PLACEHOLDER } from "./chartUtils";

/**
 * StackedBar100 — 가로 100% 스택 막대 (목업 `.mix/.mixlist`, 화면 ⑦ "재무상태" 자산·부채·자본
 * 구성 등). 값이 있는 세그먼트만 막대에 반영해 100%를 채우고, null 세그먼트는 막대에서 제외한
 * 채 범례에만 회색 자리 표시로 남긴다(근거 없는 0 금지). 서버 컴포넌트.
 */

export type StackedBar100Segment = {
  label: string;
  value: number | null;
};

export type StackedBar100Props = {
  segments: StackedBar100Segment[];
};

export default function StackedBar100({ segments }: StackedBar100Props) {
  const defined = segments.filter((s): s is { label: string; value: number } => s.value !== null && s.value > 0);
  const total = defined.reduce((sum, s) => sum + s.value, 0);
  const colorByLabel = new Map(defined.map((s, i) => [s.label, CHART_PALETTE[i % CHART_PALETTE.length]]));
  const digits = chartDigits(segments.map((s) => s.value));

  return (
    <div data-chart="stacked-bar-100">
      <div className="mix">
        {defined.map((s) => (
          <i key={s.label} style={{ width: `${((s.value / total) * 100).toFixed(2)}%`, background: colorByLabel.get(s.label) }} />
        ))}
      </div>
      <div className="mixlist">
        {segments.map((s) => {
          const missing = s.value === null || s.value <= 0;
          return (
            <div className="mx" key={s.label}>
              <i style={{ background: missing ? "var(--line)" : colorByLabel.get(s.label) }} />
              {s.label}
              <b className={missing ? "muted" : undefined}>{missing ? NULL_PLACEHOLDER : formatChartValue(s.value!, digits)}</b>
              {!missing && <em>{formatPct1((s.value! / total) * 100)}</em>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
