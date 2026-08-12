import { formatComma, NULL_PLACEHOLDER } from "./chartUtils";

/**
 * LineChart — 꺾은선 (목업 `<polyline>` + `stroke-dasharray`, 화면 ④ "EPS", 화면 ⑥ "영업이익률").
 * `provisional`이 true인 지점들(뒤쪽 연속 구간으로 가정 — 4Q 역산 등)은 주황 점선 + 큰 원형
 * 마커로 확정 구간과 구분한다. 값이 null인 지점은 선을 끊고(구간 분리) 라벨만 회색으로 표시한다.
 * 서버 컴포넌트.
 */

export type LineChartPoint = {
  label: string;
  value: number | null;
  provisional?: boolean;
};

export type LineChartProps = {
  points: LineChartPoint[];
};

const VB_W = 236;
const VB_H = 70;
const MARGIN_X = 22;
const PAD_Y = 8;

type Xy = { x: number; y: number };

function buildRuns(xs: number[], ys: (number | null)[], from: number, to: number): Xy[][] {
  const runs: Xy[][] = [];
  let current: Xy[] = [];
  for (let i = from; i <= to; i++) {
    const y = ys[i];
    if (y === null) {
      if (current.length > 1) runs.push(current);
      current = [];
      continue;
    }
    current.push({ x: xs[i], y });
  }
  if (current.length > 1) runs.push(current);
  return runs;
}

export default function LineChart({ points }: LineChartProps) {
  const n = points.length;
  const xs = points.map((_, i) => (n <= 1 ? VB_W / 2 : MARGIN_X + (i * (VB_W - MARGIN_X * 2)) / (n - 1)));

  const defined = points.map((p) => p.value).filter((v): v is number => v !== null);
  const min = defined.length ? Math.min(...defined) : 0;
  const max = defined.length ? Math.max(...defined) : 1;
  const span = max - min || 1;
  const ys = points.map((p) => (p.value === null ? null : VB_H - PAD_Y - ((p.value - min) / span) * (VB_H - PAD_Y * 2)));

  const firstProvIdx = points.findIndex((p) => p.provisional);
  const solidEnd = firstProvIdx === -1 ? n - 1 : firstProvIdx;
  const solidRuns = buildRuns(xs, ys, 0, solidEnd);
  const dashedRuns = firstProvIdx === -1 ? [] : buildRuns(xs, ys, Math.max(0, firstProvIdx - 1), n - 1);
  const hasProvisional = firstProvIdx !== -1;

  return (
    <div data-chart="line-chart">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" style={{ width: "100%", height: 70, display: "block" }}>
        {solidRuns.map((run, ri) => (
          <polyline
            key={`solid-${ri}`}
            points={run.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="var(--green)"
            strokeWidth={2.2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {dashedRuns.map((run, ri) => (
          <polyline
            key={`dash-${ri}`}
            points={run.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="var(--prov)"
            strokeWidth={2.2}
            strokeDasharray="4 3"
          />
        ))}
        {points.map((p, i) => {
          const y = ys[i];
          if (y === null) return null;
          return (
            <circle
              key={p.label}
              cx={xs[i]}
              cy={y}
              r={p.provisional ? 3.2 : 2.8}
              fill="#fff"
              stroke={p.provisional ? "var(--prov)" : "var(--green)"}
              strokeWidth={p.provisional ? 2 : 1.8}
            />
          );
        })}
      </svg>
      <div className="qbrow eps">
        {points.map((p) => (
          <div className="qbcol" key={p.label}>
            <div className={`qbx${p.value === null ? " missing" : ""}${p.provisional ? " prov" : ""}`}>
              {p.value === null ? NULL_PLACEHOLDER : formatComma(p.value)}
            </div>
          </div>
        ))}
      </div>
      {hasProvisional && <div className="cnote">실선 확정 · 점선 잠정 구간</div>}
    </div>
  );
}
