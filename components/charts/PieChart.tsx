import { CHART_PALETTE, describeArc, formatPct1, NULL_PLACEHOLDER } from "./chartUtils";

/**
 * PieChart — 파이 (목업 `.piesvg` 인라인 SVG arc, 화면 ③ "사업부문별 매출 비중").
 * 차트 라이브러리 없이 `describeArc` 헬퍼로 슬라이스별 `<path>`를 직접 계산한다. 슬라이스가
 * 1개만 유효하면(100%) arc 대신 `<circle>`로 그려 A커맨드의 완전원 특이점을 피한다.
 * 값이 null인 슬라이스는 그리지 않고 범례에 회색 자리 표시만 남긴다. 서버 컴포넌트.
 */

export type PieSlice = {
  label: string;
  value: number | null;
};

export type PieChartProps = {
  slices: PieSlice[];
};

const CX = 60;
const CY = 60;
const R = 44;

export default function PieChart({ slices }: PieChartProps) {
  const defined = slices.filter((s): s is { label: string; value: number } => s.value !== null && s.value > 0);
  const total = defined.reduce((sum, s) => sum + s.value, 0);
  const colorByLabel = new Map(defined.map((s, i) => [s.label, CHART_PALETTE[i % CHART_PALETTE.length]]));

  const arcs = defined.reduce<{ label: string; color: string; startAngle: number; endAngle: number }[]>((acc, s) => {
    const startAngle = acc.length ? acc[acc.length - 1].endAngle : 0;
    const endAngle = startAngle + (s.value / total) * 360;
    return [...acc, { label: s.label, color: colorByLabel.get(s.label)!, startAngle, endAngle }];
  }, []);

  return (
    <div className="pierow" data-chart="pie-chart">
      <svg className="piesvg" viewBox="0 0 120 120">
        {arcs.length === 1 ? (
          <circle cx={CX} cy={CY} r={R} fill={arcs[0].color} />
        ) : (
          arcs.map((a) => <path key={a.label} d={describeArc(CX, CY, R, a.startAngle, a.endAngle)} fill={a.color} />)
        )}
      </svg>
      <div className="pieleg">
        {slices.map((s) => {
          const missing = s.value === null || s.value <= 0;
          return (
            <div className="pl" key={s.label}>
              <i style={{ background: missing ? "var(--line)" : colorByLabel.get(s.label) }} />
              {s.label}
              <b className={missing ? "muted" : undefined}>{missing ? NULL_PLACEHOLDER : formatPct1((s.value! / total) * 100)}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}
