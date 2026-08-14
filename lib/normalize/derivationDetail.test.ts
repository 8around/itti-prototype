/**
 * v3 V5 — 산출물(`data/derived.json`) **전수**로 산식 구조화를 고정한다.
 *
 * 단위 테스트가 함수 하나씩 확인하는 것과 달리, 이 파일은 20종목 × (3연도 + 16분기)가 실제로
 * 만들어 낸 모든 `derivationDetail`을 훑어서 두 가지를 증명한다:
 *
 * 1. **누락 0** — `derivation` 문자열이 있는 Resolution에는 예외 없이 `derivationDetail`이 있다
 *    (그 역도 성립). 12종 패턴 중 하나라도 구조화를 빠뜨리면 여기서 걸린다.
 * 2. **산식이 실제로 값을 만든다** — `steps`를 왼쪽부터 접으면 언제나 `normalized`가 나온다.
 *    화면이 보여주는 산식이 장식이 아니라 그 값을 낳은 계산 그 자체임을 데이터로 보장한다.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { DerivationDetail, DerivationStep, Resolution } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DERIVED_PATH = join(__dirname, "..", "..", "data", "derived.json");

type DerivedFile = {
  parserVersion: string;
  stocks: {
    name: string;
    years: { year: string; resolutions: Record<string, Resolution> }[];
    quarters: { period: string; resolutions: Record<string, Resolution> }[];
  }[];
};

const derived = JSON.parse(readFileSync(DERIVED_PATH, "utf-8")) as DerivedFile;

/** 전 종목·전 기간의 (경로, Resolution) 평탄화 — 연간과 분기를 한 흐름으로 훑는다. */
function allResolutions(): { path: string; key: string; resolution: Resolution }[] {
  const out: { path: string; key: string; resolution: Resolution }[] = [];
  for (const stock of derived.stocks) {
    for (const year of stock.years) {
      for (const [key, resolution] of Object.entries(year.resolutions)) out.push({ path: `${stock.name} ${year.year} ${key}`, key, resolution });
    }
    for (const quarter of stock.quarters) {
      for (const [key, resolution] of Object.entries(quarter.resolutions)) out.push({ path: `${stock.name} ${quarter.period} ${key}`, key, resolution });
    }
  }
  return out;
}

const ALL = allResolutions();
const WITH_DETAIL = ALL.filter((r) => r.resolution.derivationDetail);

/** steps를 왼쪽부터 순서대로 접는다(괄호 없음 — `DerivationStep` 주석의 계약 그대로). */
function fold(steps: DerivationStep[]): number | null {
  let acc = steps[0].value;
  for (const step of steps.slice(1)) {
    if (step.op === "minus") acc -= step.value;
    else if (step.op === "div") acc /= step.value;
    else if (step.op === "mul") acc *= step.value;
    else return null; // op 없는 후속 step = 접을 수 없음(전환 케이스에서만 정상)
  }
  return acc;
}

describe("derivationDetail — data/derived.json 전수", () => {
  it("derivation 문자열과 derivationDetail이 정확히 짝을 이룬다 (누락 0 · 잉여 0)", () => {
    const stringOnly = ALL.filter((r) => r.resolution.derivation && !r.resolution.derivationDetail);
    const detailOnly = ALL.filter((r) => !r.resolution.derivation && r.resolution.derivationDetail);
    expect(stringOnly.map((r) => r.path)).toEqual([]);
    expect(detailOnly.map((r) => r.path)).toEqual([]);
    // 실측 규모 — 0건짜리 빈 검사가 통과하는 사고를 막는 하한선이다.
    expect(WITH_DETAIL.length).toBeGreaterThan(2_000);
  });

  it("steps를 접으면 언제나 normalized가 나온다 — 산식이 그 값을 낳은 계산 그 자체다", () => {
    const mismatches: string[] = [];
    let checked = 0;
    for (const { path, resolution } of WITH_DETAIL) {
      const detail = resolution.derivationDetail as DerivationDetail;
      if (detail.transition) continue;
      const folded = fold(detail.steps);
      if (folded === null) {
        mismatches.push(`${path}: 접을 수 없는 steps(op 누락)`);
        continue;
      }
      checked++;
      const expected = resolution.normalized;
      if (expected === null) {
        mismatches.push(`${path}: normalized가 null인데 transition이 아니다`);
        continue;
      }
      // 부동소수 나눗셈(비율 지표)이 섞이므로 상대 오차로 본다.
      if (Math.abs(folded - expected) > Math.max(Math.abs(expected) * 1e-9, 1e-6)) {
        mismatches.push(`${path}: fold ${folded} ≠ normalized ${expected}`);
      }
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
    expect(checked).toBeGreaterThan(2_000);
  });

  it("transition(전환 3종)은 normalized가 null이고 displayState가 전환 상태다", () => {
    const bad: string[] = [];
    let transitions = 0;
    for (const { path, resolution } of WITH_DETAIL) {
      if (!resolution.derivationDetail?.transition) continue;
      transitions++;
      if (resolution.normalized !== null) bad.push(`${path}: normalized가 null이 아니다`);
      if (!["TURN_TO_PROFIT", "TURN_TO_LOSS", "LOSS_CONTINUED"].includes(resolution.displayState)) bad.push(`${path}: ${resolution.displayState}`);
      if (resolution.derivationDetail.steps.length !== 2) bad.push(`${path}: 전환은 직전·당기 2개여야 한다`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
    expect(transitions).toBeGreaterThan(0);
  });

  it("모든 step 라벨이 비어 있지 않다 — 라벨이 곧 '어느 보고서에서 왔는가'라 빈 값이면 설명이 안 된다", () => {
    const empty = WITH_DETAIL.filter(({ resolution }) => resolution.derivationDetail!.steps.some((s) => s.label.trim() === "")).map((r) => r.path);
    expect(empty.slice(0, 10)).toEqual([]);
  });

  /**
   * 브리프가 전수 목록으로 못박은 12종 패턴 — 하나라도 산출물에서 사라지면(또는 구조화가
   * 누락되면) 이 표가 0건을 잡아낸다. 판정식은 kind + caveat/전환 상태 조합이다.
   */
  it("12종 derivation 패턴이 전부 구조화되어 산출물에 남아 있다", () => {
    const match = (fn: (d: DerivationDetail, r: Resolution) => boolean) => WITH_DETAIL.filter(({ resolution }) => fn(resolution.derivationDetail as DerivationDetail, resolution)).length;

    const counts = {
      "1 Q4 역산(정상)": match((d) => d.kind === "q4_reverse" && !d.caveat),
      "2 Q4 역산 계정 불일치": match((d) => d.kind === "q4_reverse" && Boolean(d.caveat?.includes("계정이 달라"))),
      "3 EPS Q4 가중평균주식수 근사": match((d) => d.kind === "q4_reverse" && Boolean(d.caveat?.includes("가중평균주식수"))),
      "4 ROA": match((d) => d.kind === "ratio" && d.resultLabel === "ROA"),
      "5 영업이익률": match((d) => d.kind === "ratio" && d.resultLabel === "영업이익률"),
      "6 FCF": match((d) => d.kind === "fcf"),
      "7 CF 인접 차분": match((d) => d.kind === "cf_diff"),
      "8 성장률(정상)": match((d) => d.kind === "growth" && !d.transition),
      "9 흑자전환": match((d, r) => d.kind === "growth" && d.transition === true && r.displayState === "TURN_TO_PROFIT"),
      "10 적자전환": match((d, r) => d.kind === "growth" && d.transition === true && r.displayState === "TURN_TO_LOSS"),
      "11 적자지속": match((d, r) => d.kind === "growth" && d.transition === true && r.displayState === "LOSS_CONTINUED"),
      "12 배당성향 fallback": match((d) => d.kind === "dividend_payout_fallback"),
    };

    const missing = Object.entries(counts).filter(([, n]) => n === 0);
    expect(missing).toEqual([]);
  });

  it("삼성전자 2024 4Q 영업이익 — 브리프 실측 고정점이 구조까지 그대로다", () => {
    const q4 = derived.stocks.find((s) => s.name === "삼성전자")!.quarters.find((q) => q.period === "2024Q4")!.resolutions.operating_income;
    expect(q4.normalized).toBe(6_492_703_000_000);
    expect(q4.provisional).toBe(true);
    expect(q4.derivationDetail).toEqual({
      kind: "q4_reverse",
      resultLabel: "영업이익",
      steps: [
        { label: "2024 사업보고서 연간", value: 32_725_961_000_000 },
        { label: "2024 3분기보고서 누적", value: 26_233_258_000_000, op: "minus" },
      ],
      unit: "KRW",
    });
  });

  it("계정 불일치 실측 3건이 caveat으로 남아 있다(NAVER·카카오 eps_basic, KB금융 operating_income)", () => {
    const conflicts = WITH_DETAIL.filter(({ resolution }) => resolution.derivationDetail?.caveat?.includes("계정이 달라")).map((r) => r.path);
    // KB금융은 연간(q4_operating_income)과 분기(operating_income) 두 축에 같은 사실이 실린다.
    expect(conflicts.some((p) => p.includes("NAVER") && p.includes("eps_basic"))).toBe(true);
    expect(conflicts.some((p) => p.includes("카카오") && p.includes("eps_basic"))).toBe(true);
    expect(conflicts.some((p) => p.includes("KB금융") && p.includes("operating_income"))).toBe(true);
    // EPS 두 건은 가중평균주식수 근사 사유와 동시에 걸린다 — 두 caveat이 합쳐져 있어야 한다.
    const naver = WITH_DETAIL.find((r) => r.path.includes("NAVER") && r.path.endsWith("eps_basic") && r.resolution.derivationDetail?.caveat?.includes("계정이 달라"));
    expect(naver?.resolution.derivationDetail?.caveat).toContain("가중평균주식수");
  });

  it("배당성향 fallback의 피연산자는 백만원 단위로 태깅돼 있다 — 태그가 빠지면 화면이 10^6배 틀린다", () => {
    const payout = WITH_DETAIL.find(({ resolution }) => resolution.derivationDetail?.kind === "dividend_payout_fallback")!;
    const steps = payout.resolution.derivationDetail!.steps;
    expect(steps[0].unit).toBe("KRW_MILLION");
    expect(steps[1].unit).toBe("KRW_MILLION");
    expect(steps[2].unit).toBe("SCALAR");
  });

  it("parserVersion이 범프되어 산출물에 반영돼 있다", () => {
    expect(derived.parserVersion).toBe("v3v5.0");
    const sample = ALL.find((r) => r.resolution.parserVersion);
    expect(sample?.resolution.parserVersion).toBe("v3v5.0");
  });
});
