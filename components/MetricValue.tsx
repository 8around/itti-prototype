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
  /**
   * "WON" — T10 추가. EPS/DPS 등 주당 값은 catalog.ts상 unit:"KRW"로 선언돼 있지만(원 단위
   * 후보 자체는 KRW 도메인이 맞다) 억원 단위로 환산하면 안 되는 값이다("-1,544억원"처럼 4자리
   * 정수 EPS가 조 단위로 부풀려 표시되는 오표기가 된다). 호출부가 이 값들을 MetricValue에 넘길
   * 때만 "WON"을 지정해 억 변환 없이 "원"으로 그대로 표기한다 — SourcePanel의 unit(KRW 그대로)과
   * 다를 수 있다(SourcePanel의 정규화 탭은 원본 크기가 1억 미만이면 억원 변환 단계 자체를
   * 생략하는 별도 가드가 있어 안전하다).
   */
  /** "SHARES" — T10 추가. 발행주식총수/자기주식수(stockTotqySttus, catalog.ts상 unit:"X")를 "728,002,365배"로
   *  오표기하지 않고 "728,002,365주"로 표기한다. */
  unit?: "KRW" | "PCT" | "X" | "WON" | "SHARES";
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
      // "배"는 증감 표기가 아니라 X 단위 자체의 기본 표기(브리프 "포맷: … 배수는 배") — %p처럼
      // 범위 밖이 아니다. 컨트롤러 판정: 리뷰 픽스 라운드 1.
      return `${value.toLocaleString("ko-KR")}배`;
    case "WON":
      return `${Math.round(value).toLocaleString("ko-KR")}원`;
    case "SHARES":
      return `${Math.round(value).toLocaleString("ko-KR")}주`;
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
      // 리뷰 픽스: 단위 무관 "0원" 고정은 배당수익률(PCT) 같은 지표에서 "0원"이라는 오표기를
      // 냈다(헬릭스미스 등 무배당 종목의 현금배당수익률) — PCT는 "0%", 그 외(WON/KRW 등 금액
      // 단위)는 종전대로 "0원"으로 표기한다. 무배당처럼 확인된 사실이지 결측(MISSING)이 아니다.
      return unit === "PCT" ? "0%" : "0원";
    case "MISSING":
      return "데이터 없음";
    case "NA_NEGATIVE_BASE":
      return "N/A";
    case "NOT_IN_PROFILE":
      return "해당 없음";
    case "SOURCE_NOT_AVAILABLE":
      return "원천 미확보";
    // v2 T2 — QoQ/YoY 분모(직전 기간) 부호 전환. 숫자(%)가 아니라 부호 전환 사실 자체가 값이다.
    case "TURN_TO_PROFIT":
      return "흑자전환";
    case "TURN_TO_LOSS":
      return "적자전환";
    case "LOSS_CONTINUED":
      return "적자지속";
  }
}

const TIER_CLASS: Record<NonNullable<MetricValueProps["tier"]>, string> = {
  T1: "tier t1",
  T2: "tier t2",
  T0: "tier t0",
};

// v2 T2 — "확인된 사실" 상태(값이 없는 게 아니라 명확한 질적 결과가 있는 상태)는 흐리게 처리하지
// 않는다. ZERO_BY_FACT(무배당 확인)와 같은 취지 — TURN_TO_PROFIT/TURN_TO_LOSS/LOSS_CONTINUED는
// %가 아닐 뿐 실제로 확인된 값이다(MISSING/NA_NEGATIVE_BASE 같은 데이터 공백이 아니다).
const KNOWN_FACT_STATES: DisplayState[] = ["OK", "ZERO_BY_FACT", "TURN_TO_PROFIT", "TURN_TO_LOSS", "LOSS_CONTINUED"];

export default function MetricValue({ state, value, unit, basis, tier, note }: MetricValueProps) {
  const muted = !KNOWN_FACT_STATES.includes(state);
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
