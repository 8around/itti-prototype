/**
 * v3 V5 — `DerivationDetail`(구조화 산식) → 사람이 읽는 한 줄.
 *
 * 서버(`components/FormulaPanel.tsx`)와 클라이언트(`components/SourcePanelClient.tsx`의 파생
 * 계산식 탭)가 **같은 문구**를 내놓아야 하므로 조립 로직을 여기 한 곳에 둔다. 순수 함수만 있어
 * 클라이언트 번들에 들어가도 안전하다(node 의존 없음).
 *
 * 산식 문자열을 파싱하지 않는다 — 파싱할 문자열이 아니라 엔진이 생산 시점에 남긴 구조를 읽는다.
 */
import { EOK, formatKrwCompact, formatPct, type KrwPrecision, shownKrwValue } from "./format";
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

/**
 * step 값 하나를 그 step이 선언한 단위로 읽는다. `KRW_MILLION`을 놓치면 10^6배 어긋난다.
 * `precision`은 `pickStepPrecision`이 고른 표시 정밀도다(기본 0 = 억 단위 반올림).
 */
export function formatStepValue(step: DerivationStep, precision: KrwPrecision = 0): string {
  if (step.unit === "SCALAR") return step.value.toLocaleString("ko-KR");
  return formatKrwCompact(stepKrw(step), precision);
}

/** step의 값을 원 단위 raw로 되돌린다(`KRW_MILLION` 태그 해석). SCALAR은 단위가 없어 그대로다. */
function stepKrw(step: DerivationStep): number {
  return step.unit === "KRW_MILLION" ? step.value * 1_000_000 : step.value;
}

/** `formatStepValue`가 그 정밀도로 찍은 값을 **읽는 사람이 집어 드는 숫자**로 되돌린다. */
function shownStepValue(step: DerivationStep, precision: KrwPrecision): number {
  if (step.unit === "SCALAR") return step.value;
  return shownKrwValue(stepKrw(step), precision);
}

/** 화면에 찍힌 피연산자만으로 왼쪽부터 접는다 — 읽는 사람이 실제로 하는 계산 그 자체. */
function foldShown(steps: DerivationStep[], precision: KrwPrecision): number {
  let acc = shownStepValue(steps[0], precision);
  for (const step of steps.slice(1)) {
    const value = shownStepValue(step, precision);
    if (step.op === "minus") acc -= value;
    else if (step.op === "div") acc /= value;
    else if (step.op === "mul") acc *= value;
  }
  return acc;
}

/** 억 소수 0자리부터 한 자리씩 내려가고, 그래도 재현이 안 되면 원 단위(무반올림)로 떨어진다. */
const PRECISION_LADDER: KrwPrecision[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, "won"];

/**
 * 이 산식의 피연산자를 **몇 자리까지 보여줘야 화면 숫자만으로 화면 결과가 재현되는가**.
 *
 * V6 최종 리뷰 Critical — 피연산자와 결과를 각자 억 자리에서 독립 반올림하던 종전 구현은
 * derived.json 전수 2,391건 중 460건(19.2%)에서 등식을 깨뜨렸다. 최악은 표시상 두 항이 같은
 * 숫자인데 결과가 0이 아닌 형태(`4억 − 4억 ⇒ −9.7%`) 15건이고, 삼성전자 FCF는 1억, 셀트리온
 * YoY는 945%p 어긋났다. `normalized` 자체는 전부 정확했다 — 깨진 것은 **화면 산식의
 * 자기무결성**이고, 그게 이 기능이 팔기로 한 것("감사 가능")이다.
 *
 * 고른 방식은 리뷰 C의 방향 2("유효자릿수를 결과에 맞춘다")다. 결과 표기(= `MetricValue`가 찍는
 * 값과 같은 문자열)는 **그대로 두고** 피연산자 쪽 정밀도만 필요한 만큼 올린다 — 방향 1(결과를
 * 피연산자에서 재계산)은 산식 패널과 본문 값이 갈리는 새 모순을 만들기 때문에 택하지 않았다.
 *
 * 결과가 원 단위로 찍히는 금액(1억 미만)은 억 반올림으로는 어떤 자릿수를 써도 재현되지 않으므로
 * (`3억 − 3억 = 38,228,364원`) 곧장 원 단위로 내린다. 실측 분포는 0자리 1,931건 · 1자리 343 ·
 * 2자리 75 · 3자리 27 · 4자리 1 · 5자리 1 · 원 단위 13건으로, **정밀도가 올라가는 것은 정확히
 * 깨져 있던 460건뿐**이고 나머지는 종전 표기와 바이트 단위로 같다.
 */
export function pickStepPrecision(detail: DerivationDetail, normalized: number | null): KrwPrecision {
  if (detail.transition || normalized === null || detail.steps.length < 2) return 0;
  const target = formatDerivationResult(detail, normalized);
  const resultInWon = detail.unit === "KRW" && Math.abs(normalized) < EOK;
  const ladder = resultInWon ? ([0, "won"] as KrwPrecision[]) : PRECISION_LADDER;
  for (const precision of ladder) {
    if (formatDerivationResult(detail, foldShown(detail.steps, precision)) === target) return precision;
  }
  // 여기 도달했다면 `normalized`가 애초에 `steps`를 접은 값이 아니라는 뜻이다(원 단위 피연산자는
  // 반올림이 없어 언제나 재현되므로). 그건 반올림 문제가 아니라 데이터 문제이고
  // `lib/normalize/derivationDetail.test.ts`가 전수로 막는 영역이라, 여기서는 표기를 건드리지
  // 않고 기본 정밀도로 되돌린다 — 원 단위 raw 숫자를 쏟아내도 읽는 사람에게 도움이 안 된다.
  return 0;
}

/** 결과값을 `detail.unit`(= 결과 단위)으로 읽는다. */
export function formatDerivationResult(detail: DerivationDetail, normalized: number | null): string {
  if (normalized === null) return "";
  if (detail.unit === "PCT") return formatPct(normalized);
  if (detail.unit === "X") return `${normalized.toLocaleString("ko-KR")}배`;
  return formatKrwCompact(normalized);
}

/**
 * `steps`는 괄호 없이 **왼쪽부터 순서대로** 접는 계약이지만, 사람은 산식을 읽을 때 곱셈·나눗셈을
 * 먼저 계산한다. 뺄셈 뒤에 나눗셈이 오는 성장률 산식이 정확히 그 함정이다:
 *
 * ```
 * 당기 10조 − 직전 6,685억 ÷ 직전 절대값 6,685억 × 100   ← 읽는 사람은 a − (b÷c)×100 으로 읽는다
 * (당기 10조 − 직전 6,685억) ÷ 직전 절대값 6,685억 × 100 ← 실제 계산은 이것
 * ```
 *
 * 그래서 **div/mul이 등장하기 전에 minus가 있으면** 그 앞부분을 괄호로 묶는다(엔진이 남기는 원본
 * `derivation` 문자열도 같은 자리에 괄호를 갖고 있다 — 구조화 판이 그 정보를 잃지 않게 한다).
 * 반환값은 괄호를 닫을 step 인덱스, 괄호가 필요 없으면 null.
 */
function parenCloseIndex(steps: DerivationStep[]): number | null {
  const scaleAt = steps.findIndex((s) => s.op === "div" || s.op === "mul");
  if (scaleAt <= 0) return null;
  const hasMinusBefore = steps.slice(1, scaleAt).some((s) => s.op === "minus");
  return hasMinusBefore ? scaleAt - 1 : null;
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
  const precision = pickStepPrecision(detail, normalized);

  if (detail.transition) {
    const [prev, cur] = detail.steps;
    return {
      head: `${subject} ${TRANSITION_TEXT[displayState] ?? ""}`.trim(),
      body: `${prev.label} ${formatStepValue(prev, precision)} → ${cur.label} ${formatStepValue(cur, precision)}`,
      transition: true,
      caveat: detail.caveat,
    };
  }

  const closeAfter = parenCloseIndex(detail.steps);
  const body = detail.steps
    .map((step, i) => {
      const value = formatStepValue(step, precision);
      const op = step.op ? `${OP_SYMBOL[step.op]} ` : "";
      // SCALAR(백분율 환산 100)는 라벨을 찍지 않는다 — "× 100"만으로 뜻이 통하고, 결과에 이미
      // %가 붙어 있어 중복이다. 라벨 자체는 JSON에 남아 있어 데이터 소비자는 그대로 읽을 수 있다.
      const text = step.unit === "SCALAR" ? `${op}${value}` : `${op}${step.label} ${value}`;
      if (closeAfter === null) return text;
      if (i === 0) return `(${text}`;
      if (i === closeAfter) return `${text})`;
      return text;
    })
    .join(" ");

  return { head: `${subject} ${formatDerivationResult(detail, normalized)}`.trim(), body, transition: false, caveat: detail.caveat };
}
