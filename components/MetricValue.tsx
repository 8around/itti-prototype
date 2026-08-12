import type { DisplayState } from "@/lib/normalize/types";

/**
 * MetricValue — displayState 6종의 단일 렌더링 진입점 (플랜 §7 정본).
 *
 * `Resolution.displayState`를 사람이 읽는 텍스트/스타일로 변환하는 유일한 지점이다. 화면
 * 어디서든 지표 하나를 보여줄 때 숫자를 직접 포맷하지 말고 이 컴포넌트를 거친다 — 그래야
 * `ZERO_BY_FACT`(무배당 확인 → "0원")와 `MISSING`(못 읽음 → "데이터 없음")이 실수로 섞이지
 * 않는다. 서버 컴포넌트.
 *
 * `value`는 이미 표시 단위로 변환된 값이다(KRW는 억원 단위, PCT는 %p 아닌 원값 그대로) —
 * 원 단위 → 억 단위 환산은 호출부(정규화 엔진/화면 조합) 책임이고 이 컴포넌트는 포맷만 한다.
 */

export type MetricValueProps = {
  state: DisplayState;
  value?: number | null;
  unit?: "KRW" | "PCT" | "X";
  basis?: "연결" | "별도";
  tier?: "T1" | "T2" | "T0";
  /** 상태를 보충 설명하는 대괄호 주석 — "무배당 확인", "분모 음수", "금융 프로필", "DART 미제공" 등. */
  note?: string;
};

function formatValue(value: number, unit: MetricValueProps["unit"]): string {
  switch (unit) {
    case "PCT":
      return `${value.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    case "X":
      return value.toLocaleString("ko-KR");
    case "KRW":
    default:
      return `${Math.round(value).toLocaleString("ko-KR")}억원`;
  }
}

function renderText(state: DisplayState, value: number | null | undefined, unit: MetricValueProps["unit"]): string {
  switch (state) {
    case "OK":
      return typeof value === "number" ? formatValue(value, unit) : "데이터 없음";
    case "ZERO_BY_FACT":
      // 단위와 무관하게 "0원" 고정 — 무배당처럼 확인된 사실이지 결측이 아니다.
      return "0원";
    case "MISSING":
      return "데이터 없음";
    case "NA_NEGATIVE_BASE":
      return "N/A";
    case "NOT_IN_PROFILE":
      return "해당 없음";
    case "SOURCE_NOT_AVAILABLE":
      return "원천 미확보";
  }
}

const TIER_CLASS: Record<NonNullable<MetricValueProps["tier"]>, string> = {
  T1: "tier t1",
  T2: "tier t2",
  T0: "tier t0",
};

export default function MetricValue({ state, value, unit, basis, tier, note }: MetricValueProps) {
  const muted = state !== "OK" && state !== "ZERO_BY_FACT";
  const text = renderText(state, value, unit);

  return (
    <span className="mv" data-metric-state={state}>
      <span className={`mv-num${muted ? " muted" : ""}`}>{text}</span>
      {note && <span className="mv-note">[{note}]</span>}
      {basis && <span className="mv-basis">[{basis}]</span>}
      {tier && <span className={TIER_CLASS[tier]}>{tier}</span>}
    </span>
  );
}
