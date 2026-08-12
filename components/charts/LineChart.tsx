import { formatComma, NULL_PLACEHOLDER } from "./chartUtils";

/**
 * LineChart — 꺾은선 (목업 `<polyline>` + `stroke-dasharray`, 화면 ④ "EPS", 화면 ⑥ "영업이익률").
 * `provisional`이 true인 지점들(뒤쪽 연속 구간으로 가정 — 4Q 역산 등)은 주황 점선 + 큰 원형
 * 마커로 확정 구간과 구분한다. 값이 null인 지점은 선을 끊고(구간 분리) 라벨만 회색으로 표시한다.
 * 서버 컴포넌트.
 *
 * v2 T3 확장 (전부 옵셔널 — 기존 `points: {label,value,provisional?}[]` 단독 호출부는
 * 그대로 동작해 하위호환 유지):
 * - `baseline`: 도메인(min/max)에 강제 포함되는 기준선(예: 부채비율 100%) — 학습가이드 `line()`의
 *   `opts.threshold` 처리(`lo=Math.min(lo,threshold); hi=Math.max(hi,threshold)`)를 그대로 이식.
 *   항상 `--up`(적색) 점선으로 그린다(기준선=경고선 관례, 학습가이드와 동일 배색).
 * - `color`: 선·점 색(기본 `--green`) — 기존 코드의 "%-계열 등 다른 색 필요" 한계를 해소.
 * - `points[].state`: 값 대신 상태 칩(예: "흑자전환")을 표시. 값이 있어도 내부적으로 null
 *   취급해 선을 끊는다 — QoQ 분모(직전 분기)가 적자라 %가 무의미할 때 쓴다.
 * - `unit`/`sign`: 값 라벨에 단위 접미사·양수 `+` 접두사. 음수 값은 `--up`(적색)으로 표시.
 */

export type LineChartPoint = {
  label: string;
  /** state가 있으면 생략 가능(무시된다) — 기존 계약과의 호환을 위해 옵셔널로만 완화. */
  value?: number | null;
  provisional?: boolean;
  /** 값 대신 표시할 상태 칩 텍스트(예: "흑자전환"). 지정되면 value는 무시하고 선을 끊는다. */
  state?: string;
};

export type LineChartProps = {
  points: LineChartPoint[];
  /** 도메인에 반드시 포함되는 기준선. label을 주면 차트 아래에 문구로 표시된다. */
  baseline?: { value: number; label?: string };
  /** 선·점 색상(CSS 색상 값 또는 `var(--token)`). 기본 `--green`. */
  color?: string;
  /** 값 뒤에 붙는 단위 접미사 (예: "%", "배"). */
  unit?: string;
  /** true면 양수 값 앞에 `+`를 붙인다. */
  sign?: boolean;
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

export default function LineChart({ points, baseline, color, unit, sign }: LineChartProps) {
  const n = points.length;
  const xs = points.map((_, i) => (n <= 1 ? VB_W / 2 : MARGIN_X + (i * (VB_W - MARGIN_X * 2)) / (n - 1)));

  // state 지점은 값이 있어도 그리지 않고 선을 끊는다 — null과 동일하게 취급.
  const effectiveValues = points.map((p) => (p.state ? null : (p.value ?? null)));

  const defined = effectiveValues.filter((v): v is number => v !== null);
  let min = defined.length ? Math.min(...defined) : 0;
  let max = defined.length ? Math.max(...defined) : 1;
  if (baseline) {
    min = Math.min(min, baseline.value);
    max = Math.max(max, baseline.value);
  }
  const span = max - min || 1;
  const ys = effectiveValues.map((v) => (v === null ? null : VB_H - PAD_Y - ((v - min) / span) * (VB_H - PAD_Y * 2)));
  const baselineY = baseline ? VB_H - PAD_Y - ((baseline.value - min) / span) * (VB_H - PAD_Y * 2) : null;

  const strokeColor = color || "var(--green)";

  const firstProvIdx = points.findIndex((p) => p.provisional);
  const solidEnd = firstProvIdx === -1 ? n - 1 : firstProvIdx;
  const solidRuns = buildRuns(xs, ys, 0, solidEnd);
  const dashedRuns = firstProvIdx === -1 ? [] : buildRuns(xs, ys, Math.max(0, firstProvIdx - 1), n - 1);
  const hasProvisional = firstProvIdx !== -1;

  return (
    <div data-chart="line-chart">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" style={{ width: "100%", height: 70, display: "block" }}>
        {baselineY !== null && (
          <line
            x1={MARGIN_X}
            y1={baselineY}
            x2={VB_W - MARGIN_X}
            y2={baselineY}
            stroke="var(--up)"
            strokeWidth={1.2}
            strokeDasharray="4 3"
          />
        )}
        {solidRuns.map((run, ri) => (
          <polyline
            key={`solid-${ri}`}
            points={run.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={strokeColor}
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
              stroke={p.provisional ? "var(--prov)" : strokeColor}
              strokeWidth={p.provisional ? 2 : 1.8}
            />
          );
        })}
      </svg>
      <div className="qbrow eps">
        {points.map((p) => (
          <div className="qbcol" key={p.label}>
            {p.state ? (
              <div className="qbx">
                <span className="statechip">{p.state}</span>
              </div>
            ) : (
              <div
                className={`qbx${p.value == null ? " missing" : ""}${p.value != null && p.value < 0 ? " neg" : ""}${
                  p.provisional ? " prov" : ""
                }`}
              >
                {p.value == null ? NULL_PLACEHOLDER : `${sign && p.value > 0 ? "+" : ""}${formatComma(p.value)}${unit ?? ""}`}
              </div>
            )}
          </div>
        ))}
      </div>
      {baseline?.label && <div className="cnote">{baseline.label}</div>}
      {hasProvisional && <div className="cnote">실선 확정 · 점선 잠정 구간</div>}
    </div>
  );
}
