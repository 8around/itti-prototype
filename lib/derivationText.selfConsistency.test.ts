/**
 * v3 V6 — **화면 산식의 자기무결성**을 `data/derived.json` 전수로 고정한다.
 *
 * `lib/normalize/derivationDetail.test.ts`가 이미 "원 단위 raw 값으로 접으면 `normalized`가
 * 나온다"를 전수로 보장한다. 이 파일이 보장하는 것은 그보다 한 겹 위, **화면에 실제로 찍힌 숫자**로
 * 접었을 때도 화면에 찍힌 결과가 나오는가다. 두 겹이 필요한 이유는 종전 구현이 정확히 그 사이에서
 * 깨졌기 때문이다 — 피연산자와 결과를 각자 억 자리에서 독립 반올림해 2,391건 중 460건(19.2%)이
 * 화면 숫자로는 재현되지 않았고, 최악의 형태는 표시상 두 항이 같은데 결과가 0이 아닌
 * `4억 − 4억 ⇒ −9.7%`였다. 이 기능이 파는 것이 "감사 가능"이므로 검산하는 독자가 첫 시도에서
 * 걸려 넘어지면 나머지 숫자도 신뢰를 잃는다.
 *
 * 검사 방식은 **포맷 → 파싱 왕복**이다. 내부 계산값을 다시 쓰면 순환 논증이 되므로, 화면에 나가는
 * 문자열(`formatStepValue`가 만든 토큰)을 그대로 사람처럼 다시 숫자로 읽어 접는다. 그 토큰이 실제
 * `body`에 들어 있다는 것도 함께 확인해 "포맷은 맞는데 화면엔 다른 문자열"인 경우를 막는다.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildDerivationLine, formatDerivationResult, formatStepValue, pickStepPrecision } from "./derivationText";
import type { DerivationDetail, DerivationStep, Resolution } from "./normalize/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DERIVED_PATH = join(__dirname, "..", "data", "derived.json");

type DerivedFile = {
  stocks: {
    name: string;
    years: { year: string; resolutions: Record<string, Resolution> }[];
    quarters: { period: string; resolutions: Record<string, Resolution> }[];
  }[];
};

const derived = JSON.parse(readFileSync(DERIVED_PATH, "utf-8")) as DerivedFile;

type Entry = { path: string; detail: DerivationDetail; normalized: number | null };

const ALL: Entry[] = [];
for (const stock of derived.stocks) {
  for (const year of stock.years) {
    for (const [key, r] of Object.entries(year.resolutions)) {
      if (r.derivationDetail) ALL.push({ path: `${stock.name} ${year.year} ${key}`, detail: r.derivationDetail, normalized: r.normalized });
    }
  }
  for (const quarter of stock.quarters) {
    for (const [key, r] of Object.entries(quarter.resolutions)) {
      if (r.derivationDetail) ALL.push({ path: `${stock.name} ${quarter.period} ${key}`, detail: r.derivationDetail, normalized: r.normalized });
    }
  }
}
/** 전환 3종은 등호가 아니라 "직전 → 당기" 비교라 접기가 정의되지 않는다(`DerivationDetail.transition`). */
const FOLDABLE = ALL.filter((e) => !e.detail.transition && e.normalized !== null);

/** "51조 4,063.55억" / "−1,874억" / "338,264,000원" / "100" → 숫자. 사람이 화면을 읽는 그 순서 그대로. */
function parseShown(text: string): number {
  const sign = text.startsWith("−") ? -1 : 1;
  const body = text.replace("−", "").replace(/,/g, "");
  const won = /^([\d.]+)원$/.exec(body);
  if (won) return sign * Number(won[1]);
  const joEok = /^([\d.]+)조(?:\s([\d.]+)억)?$/.exec(body);
  if (joEok) return sign * (Number(joEok[1]) * 10_000 + Number(joEok[2] ?? 0)) * 100_000_000;
  const eok = /^([\d.]+)억$/.exec(body);
  if (eok) return sign * Number(eok[1]) * 100_000_000;
  const scalar = /^[\d.]+$/.exec(body);
  if (scalar) return sign * Number(body);
  throw new Error(`읽을 수 없는 표시 문자열: ${text}`);
}

/** 화면 토큰만으로 왼쪽부터 접는다 — 괄호는 표기상 장식이고 계약은 좌→우다. */
function foldFromScreen(steps: DerivationStep[], tokens: string[]): number {
  let acc = parseShown(tokens[0]);
  for (let i = 1; i < steps.length; i++) {
    const value = parseShown(tokens[i]);
    if (steps[i].op === "minus") acc -= value;
    else if (steps[i].op === "div") acc /= value;
    else if (steps[i].op === "mul") acc *= value;
  }
  return acc;
}

describe("산식 자기무결성 — data/derived.json 전수", () => {
  it("검사 대상 규모가 유지된다 — 0건짜리 빈 검사가 통과하는 사고를 막는다", () => {
    expect(ALL.length).toBe(2_659);
    expect(FOLDABLE.length).toBe(2_391);
  });

  it("화면에 찍힌 숫자만으로 접으면 화면에 찍힌 결과가 나온다 (불일치 0건)", () => {
    const mismatches: string[] = [];
    for (const { path, detail, normalized } of FOLDABLE) {
      const precision = pickStepPrecision(detail, normalized);
      const tokens = detail.steps.map((s) => formatStepValue(s, precision));
      const shownResult = formatDerivationResult(detail, normalized);
      const foldedResult = formatDerivationResult(detail, foldFromScreen(detail.steps, tokens));
      if (foldedResult !== shownResult) mismatches.push(`${path}: 화면 숫자로 접으면 ${foldedResult} · 화면 결과 ${shownResult}`);
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
  });

  it("접기에 쓴 토큰이 실제 화면 문자열(body)에 그대로 들어 있다 — 검사와 화면이 갈라지지 않는다", () => {
    const missing: string[] = [];
    for (const { path, detail, normalized } of FOLDABLE) {
      const precision = pickStepPrecision(detail, normalized);
      const line = buildDerivationLine(detail, normalized, "OK");
      for (const step of detail.steps) {
        const token = formatStepValue(step, precision);
        if (!line.body.includes(token)) missing.push(`${path}: "${token}"이 body에 없다 — ${line.body}`);
      }
    }
    expect(missing.slice(0, 10)).toEqual([]);
  });

  it("정밀도가 올라가는 것은 깨져 있던 460건뿐 — 나머지 1,931건은 종전 표기 그대로다", () => {
    const byPrecision = new Map<string, number>();
    for (const { detail, normalized } of FOLDABLE) {
      const key = String(pickStepPrecision(detail, normalized));
      byPrecision.set(key, (byPrecision.get(key) ?? 0) + 1);
    }
    expect(byPrecision.get("0")).toBe(1_931);
    expect(FOLDABLE.length - byPrecision.get("0")!).toBe(460);
    // 원 단위까지 내려가는 것은 결과가 1억 미만 금액인 케이스뿐이다(억 반올림으로는 재현 불가).
    expect(byPrecision.get("won")).toBe(13);
  });

  it("리뷰가 지목한 최악 케이스 — 표시상 'A − A'인데 결과가 0이 아니던 형태가 사라졌다", () => {
    // 앱클론 2024Q2 매출액 QoQ: 종전 "당기 4억 − 직전분기 4억 ÷ 직전분기 절대값 4억 × 100 ⇒ −9.7%"
    const apclon = find("앱클론 2024Q2 qoq_revenue");
    const apclonLine = buildDerivationLine(apclon.detail, apclon.normalized, "OK", "24.2Q");
    expect(apclonLine.body).not.toMatch(/당기 2024Q2 4억 − 직전분기 2024Q1 4억/);
    expect(foldsBackToScreen(apclon)).toBe(true);

    // 신라젠 2023Q3 CAPEX: 종전 "3억 − 3억 ⇒ 38,228,364원" → 결과가 원 단위라 피연산자도 원 단위로.
    const sillajen = find("신라젠 2023Q3 capex");
    const sillajenLine = buildDerivationLine(sillajen.detail, sillajen.normalized, "OK", "23.3Q");
    expect(sillajenLine.body).toBe("2023 3분기보고서 누적 322,182,764원 − 2023 반기보고서 누적 283,954,400원");
    expect(sillajenLine.head).toBe("23.3Q 설비투자(CAPEX) 38,228,364원");
  });

  it("삼성전자 FCF의 1억 어긋남과 셀트리온 YoY의 945%p 어긋남이 해소됐다", () => {
    const fcf = find("삼성전자 2024 fcf");
    expect(buildDerivationLine(fcf.detail, fcf.normalized, "OK", "24년").body).toBe("영업활동현금흐름 72조 9,826.2억 − 설비투자(CAPEX, 유형자산 취득) 51조 4,063.6억");
    expect(foldsBackToScreen(fcf)).toBe(true);

    const celltrion = find("셀트리온 2024Q4 yoy_net_income_attributable_to_owners");
    expect(foldsBackToScreen(celltrion)).toBe(true);
  });

  it("Q4 역산 실측 고정점(삼성전자 24.4Q 영업이익)은 정밀도 0이라 표기가 바뀌지 않는다", () => {
    const q4 = find("삼성전자 2024Q4 operating_income");
    expect(pickStepPrecision(q4.detail, q4.normalized)).toBe(0);
    expect(buildDerivationLine(q4.detail, q4.normalized, "OK", "24.4Q").body).toBe("2024 사업보고서 연간 32조 7,260억 − 2024 3분기보고서 누적 26조 2,333억");
  });
});

function find(path: string): Entry {
  const hit = ALL.find((e) => e.path === path);
  if (!hit) throw new Error(`derived.json에 없는 경로: ${path}`);
  return hit;
}

function foldsBackToScreen({ detail, normalized }: Entry): boolean {
  const precision = pickStepPrecision(detail, normalized);
  const tokens = detail.steps.map((s) => formatStepValue(s, precision));
  return formatDerivationResult(detail, foldFromScreen(detail.steps, tokens)) === formatDerivationResult(detail, normalized);
}
