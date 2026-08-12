import { formatComma, NULL_PLACEHOLDER } from "./chartUtils";

/**
 * LineChart — 꺾은선.
 *
 * 클라이언트 합의(슬랙 스레드, 202608-mockup-refit.md §슬랙 반영사항 ①)에 따라
 * **성장률·비율 추이(QoQ·YoY·ROE·부채비율·이자보상배율)는 전부 이 컴포넌트로 그린다.**
 * 금액 추이는 막대(QuarterBars/ZeroAxisBars) 담당이다.
 *
 * 7셋 확장으로 세 가지가 추가됐다 — 전부 기존 `{points}`만 넘기는 호출부와 호환된다.
 *
 * 1. **`color`** — 목업이 EPS(그린)와 이익률(주황)을 다른 색으로 그리는데 색 prop이 없어
 *    구분할 수 없던 제약(이전 버전 주석의 "T7이 필요해지면 확장할 것")을 해소했다.
 * 2. **`baseline`** — 부채비율 100% · 이자보상배율 1배처럼 "넘느냐 마느냐"가 의미의 전부인
 *    지표는 임계선을 같이 그어야 읽힌다(학습가이드 SET5 "빨간 점선 = 100% 기준").
 * 3. **음수 대응** — 성장률은 −100%까지 내려간다. 값 범위에 음수가 섞이면 0축을 그려
 *    "기준선 아래 = 역성장"이 한눈에 보이게 한다(합의사항 "손실 분기 기준선 아래"의 비율 버전).
 *
 * `provisional`이 true인 지점(4Q 역산 등)은 주황 점선 + 큰 마커. 값이 null인 지점은 선을
 * 끊고 라벨만 회색으로 둔다 — 없는 구간을 이어 그리면 없는 추세를 만들어 낸다.
 *
 * 서버 컴포넌트(클라이언트 JS 0바이트).
 */

export type LineChartPoint = {
  label: string;
  value: number | null;
  provisional?: boolean;
  /**
   * 값이 null이지만 사유가 있는 지점(예: 직전 분기가 적자라 성장률이 무의미 → "흑자전환").
   * 숫자 자리에 이 문구를 대신 찍는다 — displayState `NA_NEGATIVE_BASE`의 화면 표현.
   */
  placeholder?: string;
};

export type LineChartProps = {
  points: LineChartPoint[];
  /** 선 색. 기본은 브랜드 그린. 비율 계열을 병렬로 놓을 때 계열마다 다른 색을 준다. */
  color?: string;
  /** 임계선 — `{ value: 100, label: "100%" }`. 값 범위에 자동 포함되어 항상 화면에 들어온다. */
  baseline?: { value: number; label: string };
  /** 값 뒤에 붙는 단위 표기("%", "배"). 축 라벨이 아니라 각 지점 숫자에 붙는다. */
  unit?: string;
};

/**
 * ## 종횡비 — 이 컴포넌트에서 가장 중요한 수치
 *
 * 예전에는 `viewBox="0 0 236 70"` + `preserveAspectRatio="none"` + `height:70px` 고정이었다.
 * 목업이 폭 430px 모바일 칼럼 기준이라 그 조합이 맞았지만, 지금 상세 화면은 폭 900px라
 * **가로로만 3.6배 늘어나** 세 가지가 한꺼번에 망가졌다.
 *
 * - 기울기가 눌려 추세가 평평해 보인다 (사용자 지적: "위아래로 눌려 있다")
 * - 마커 `<circle>`이 가로로 늘어난 타원이 된다
 * - `stroke-width`가 선의 각도에 따라 달라진다 (수평은 얇고 수직은 두껍게)
 *
 * → `preserveAspectRatio`를 기본값(`meet`, 균일 스케일)으로 되돌리고 높이를 `auto`로 준다.
 * 이제 폭이 변해도 **비율이 유지**되므로 어떤 폭에서도 왜곡이 없다. viewBox 종횡비 4:1은
 * 900px 칼럼에서 약 225px 높이가 되어 9개 분기 추이를 읽기에 충분하고, 390px 모바일에서는
 * 약 98px로 자연히 줄어든다.
 */
const VB_W = 720;
const VB_H = 180;
const MARGIN_X = 40;
const PAD_Y = 22;

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

export default function LineChart({ points, color = "var(--green)", baseline, unit = "" }: LineChartProps) {
  const n = points.length;
  const xs = points.map((_, i) => (n <= 1 ? VB_W / 2 : MARGIN_X + (i * (VB_W - MARGIN_X * 2)) / (n - 1)));

  const defined = points.map((p) => p.value).filter((v): v is number => v !== null);
  // 기준선과 0축은 "값이 그 선을 넘는지"를 보여주는 게 목적이라 스케일 범위에 반드시 포함시킨다.
  const anchors = [...defined];
  if (baseline) anchors.push(baseline.value);
  const hasNegative = defined.some((v) => v < 0);
  if (hasNegative) anchors.push(0);

  const min = anchors.length ? Math.min(...anchors) : 0;
  const max = anchors.length ? Math.max(...anchors) : 1;
  const span = max - min || 1;
  const toY = (v: number) => VB_H - PAD_Y - ((v - min) / span) * (VB_H - PAD_Y * 2);
  const ys = points.map((p) => (p.value === null ? null : toY(p.value)));

  const firstProvIdx = points.findIndex((p) => p.provisional);
  const solidEnd = firstProvIdx === -1 ? n - 1 : firstProvIdx;
  const solidRuns = buildRuns(xs, ys, 0, solidEnd);
  const dashedRuns = firstProvIdx === -1 ? [] : buildRuns(xs, ys, Math.max(0, firstProvIdx - 1), n - 1);
  const hasProvisional = firstProvIdx !== -1;

  return (
    <div data-chart="line-chart">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img">
        {/* 최대·최소 눈금선 — 값이 좁은 범위에 몰려 있을 때 선이 어디쯤인지 가늠하게 해 준다. */}
        <line x1={0} y1={toY(max)} x2={VB_W} y2={toY(max)} stroke="var(--line-2)" strokeWidth={1} />
        <line x1={0} y1={toY(min)} x2={VB_W} y2={toY(min)} stroke="var(--line-2)" strokeWidth={1} />
        {hasNegative && <line x1={0} y1={toY(0)} x2={VB_W} y2={toY(0)} stroke="var(--line)" strokeWidth={1.5} />}
        {baseline && <line x1={0} y1={toY(baseline.value)} x2={VB_W} y2={toY(baseline.value)} stroke="var(--up)" strokeWidth={1.5} strokeDasharray="7 5" />}
        {solidRuns.map((run, ri) => (
          <polyline
            key={`solid-${ri}`}
            points={run.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={2.6}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {dashedRuns.map((run, ri) => (
          <polyline key={`dash-${ri}`} points={run.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--prov)" strokeWidth={2.6} strokeDasharray="7 5" />
        ))}
        {points.map((p, i) => {
          const y = ys[i];
          if (y === null) return null;
          return <circle key={p.label} cx={xs[i]} cy={y} r={p.provisional ? 5 : 4.2} fill="var(--paper)" stroke={p.provisional ? "var(--prov)" : color} strokeWidth={2.4} />;
        })}
      </svg>
      <div className="qbrow eps">
        {points.map((p) => (
          <div className="qbcol" key={p.label}>
            <div className={`qbx${p.value === null ? " missing" : ""}${p.provisional ? " prov" : ""}`}>
              {p.value === null ? (p.placeholder ?? NULL_PLACEHOLDER) : `${formatComma(p.value)}${unit}`}
            </div>
            <div className="qbx missing">{p.label}</div>
          </div>
        ))}
      </div>
      {baseline && <div className="cnote">붉은 점선 = {baseline.label} 기준선</div>}
      {hasProvisional && <div className="cnote">실선 확정 · 점선 잠정 구간</div>}
    </div>
  );
}
