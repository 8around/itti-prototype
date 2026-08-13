/**
 * v3 V5 — `DerivationDetail`(구조화 산식) → 사람이 읽는 한 줄.
 *
 * 서버(`components/FormulaPanel.tsx`)와 클라이언트(`components/SourcePanelClient.tsx`의 파생
 * 계산식 탭)가 **같은 문구**를 내놓아야 하므로 조립 로직을 여기 한 곳에 둔다. 순수 함수만 있어
 * 클라이언트 번들에 들어가도 안전하다(node 의존 없음).
 *
 * 산식 문자열을 파싱하지 않는다 — 파싱할 문자열이 아니라 엔진이 생산 시점에 남긴 구조를 읽는다.
 */
import { formatKrwCompact, formatPct } from "./format";
import type { DerivationDetail, DerivationStep, DisplayState } from "./normalize/types";

const OP_SYMBOL: Record<NonNullable<DerivationStep["op"]>, string> = {
  minus: "−",
  div: "÷",
  mul: "×",
};

/**
 * 전환 3종의 결과 문구. **정본은 `components/MetricValue.tsx`의 `renderText()`**이고 여기서 새
 * 문구를 짓지 않는다 — `app/stock/[code]/page.tsx`의 `GROWTH_STATE_CHIP`이 같은 이유로 같은 3개
 * 문구만 복제해 두고 있다(그 주석 참조).
 */
const TRANSITION_TEXT: Partial<Record<DisplayState, string>> = {
  TURN_TO_PROFIT: "흑자전환",
  TURN_TO_LOSS: "적자전환",
  LOSS_CONTINUED: "적자지속",
};

/** step 값 하나를 그 step이 선언한 단위로 읽는다. `KRW_MILLION`을 놓치면 10^6배 어긋난다. */
export function formatStepValue(step: DerivationStep): string {
  if (step.unit === "SCALAR") return step.value.toLocaleString("ko-KR");
  if (step.unit === "KRW_MILLION") return formatKrwCompact(step.value * 1_000_000);
  return formatKrwCompact(step.value);
}

/** 결과값을 `detail.unit`(= 결과 단위)으로 읽는다. */
export function formatDerivationResult(detail: DerivationDetail, normalized: number | null): string {
  if (normalized === null) return "";
  if (detail.unit === "PCT") return formatPct(normalized);
  if (detail.unit === "X") return `${normalized.toLocaleString("ko-KR")}배`;
  return formatKrwCompact(normalized);
}

export type DerivationLine = {
  /** "24.4Q 영업이익 6조 4,927억" — 무엇이 얼마인지. */
  head: string;
  /** "2024 사업보고서 연간 32조 7,260억 − 2024 3분기보고서 누적 26조 2,332억" — 어떻게 나왔는지. */
  body: string;
  /** true면 `body`는 계산식이 아니라 "직전 → 당기" 상태 비교다(등호로 잇지 말 것). */
  transition: boolean;
  caveat?: string;
};

/**
 * 산식 한 줄을 조립한다. `periodLabel`은 화면이 아는 기간 표기("24.4Q"/"24년"/"제71기 4Q")로,
 * 엔진은 결산월을 모르기 때문에 여기서 합쳐진다(`lib/normalize/types.ts`의 `resultLabel` 주석).
 */
export function buildDerivationLine(detail: DerivationDetail, normalized: number | null, displayState: DisplayState, periodLabel?: string): DerivationLine {
  const subject = [periodLabel, detail.resultLabel].filter(Boolean).join(" ");

  if (detail.transition) {
    const [prev, cur] = detail.steps;
    return {
      head: `${subject} ${TRANSITION_TEXT[displayState] ?? ""}`.trim(),
      body: `${prev.label} ${formatStepValue(prev)} → ${cur.label} ${formatStepValue(cur)}`,
      transition: true,
      caveat: detail.caveat,
    };
  }

  const body = detail.steps
    .map((step) => {
      const value = formatStepValue(step);
      const op = step.op ? `${OP_SYMBOL[step.op]} ` : "";
      // SCALAR(백분율 환산 100)는 라벨을 찍지 않는다 — "× 100"만으로 뜻이 통하고, 결과에 이미
      // %가 붙어 있어 중복이다. 라벨 자체는 JSON에 남아 있어 데이터 소비자는 그대로 읽을 수 있다.
      return step.unit === "SCALAR" ? `${op}${value}` : `${op}${step.label} ${value}`;
    })
    .join(" ");

  return { head: `${subject} ${formatDerivationResult(detail, normalized)}`.trim(), body, transition: false, caveat: detail.caveat };
}
