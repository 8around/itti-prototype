/**
 * `alotMatter`(배당에 관한 사항) 리졸버 — 인덱스 기반 + 라벨 검증 이중화 (#22).
 *
 * - `stock_knd`는 절대 필터 조건으로 쓰지 않는다. 행 위치로 보통주/우선주를 판정한다.
 * - 연도별 스키마 3분기: 2015(14행) / 2016(idx2 `(개별)`) / 2017+(idx2 `(별도)`, 15행).
 *   실제 스냅샷은 전부 `bsns_year=2025` 1회 호출(2023~2025 커버)로 수집되어 있어 2017+ 스키마만
 *   실측 검증 가능하다 — 2015/2016 분기는 방어적으로 구현했으나 픽스처로 검증되지 않았다.
 * - 1회 호출이 당기(`thstrm`)/전기(`frmtrm`)/전전기(`lwfr`) 3개년을 반환한다 — 어느 컬럼을 읽을지는
 *   호출부가 연도별로 지정한다.
 */

import type { DartEnvelope } from "../dart/client";
import { parseAmount } from "./parse";
import { PARSER_VERSION } from "./types";
import type { MetricCandidate, Resolution } from "./types";

export interface AlotRow {
  se: string;
  stock_knd: string;
  thstrm?: string;
  frmtrm?: string;
  lwfr?: string;
}

export interface AlotBody {
  status: string;
  list?: AlotRow[];
}

export type AlotColumn = "thstrm" | "frmtrm" | "lwfr";

type RowKey = "net_income" | "eps" | "dividend_total" | "payout" | "yield_common" | "dps_common";

interface Schema {
  variant: "2015" | "2016" | "modern";
  rowIndex: Record<RowKey, number>;
}

/** "(연결)"/"(별도)"/"(개별)" 접두와 "주당 현금배당금"의 공백차를 흡수한다. */
function normalizeLabel(s: string): string {
  return s.replace(/^\([^)]+\)/, "").replace(/\s+/g, "");
}

const EXPECTED_LABEL: Record<RowKey, string> = {
  net_income: "당기순이익(백만원)",
  eps: "주당순이익(원)",
  dividend_total: "현금배당금총액(백만원)",
  payout: "현금배당성향(%)",
  yield_common: "현금배당수익률(%)",
  dps_common: "주당현금배당금(원)",
};

/** 행 수(14/15)와 idx2 라벨로 2015 / 2016 / 2017+ 스키마를 판정한다. */
function detectSchema(rows: AlotRow[]): Schema {
  if (rows.length <= 14) {
    return {
      variant: "2015",
      rowIndex: { net_income: 1, eps: 2, dividend_total: 3, payout: 5, yield_common: 6, dps_common: 10 },
    };
  }
  const idx2Label = normalizeLabel(rows[2]?.se ?? "");
  const variant = idx2Label.includes("개별") ? "2016" : "modern";
  return {
    variant,
    rowIndex: { net_income: 1, eps: 3, dividend_total: 4, payout: 6, yield_common: 7, dps_common: 11 },
  };
}

/** 인덱스로 행을 집고 라벨을 검증한다 — 어긋나면 그 행을 신뢰하지 않고 undefined를 반환한다. */
function findValidatedRow(rows: AlotRow[], schema: Schema, rowKey: RowKey): AlotRow | undefined {
  const row = rows[schema.rowIndex[rowKey]];
  if (!row) return undefined;
  return normalizeLabel(row.se) === EXPECTED_LABEL[rowKey] ? row : undefined;
}

function pickColumn(row: AlotRow | undefined, column: AlotColumn): string | undefined {
  return row?.[column];
}

const ROW_KEY_BY_METRIC: Record<string, RowKey> = {
  eps: "eps",
  dps_common: "dps_common",
  yield_common: "yield_common",
  payout: "payout",
};

export function resolveAlotMatterMetric(
  candidate: MetricCandidate,
  envelope: DartEnvelope<AlotBody> | null,
  column: AlotColumn,
  fsDiv: "CFS" | "OFS",
  fsDivFallbackApplied: boolean,
): Resolution {
  const rowKey = ROW_KEY_BY_METRIC[candidate.accountIds[0]];
  const attempts: Resolution["attempts"] = [];
  const base = { metricKey: candidate.key, fsDiv, fsDivFallbackApplied, parserVersion: PARSER_VERSION };

  const rows = envelope?.body.status === "000" ? (envelope.body.list ?? []) : [];
  if (rows.length === 0) {
    attempts.push({ accountId: rowKey, result: "NO_ROW" });
    return { ...base, attempts, normalized: null, displayState: "MISSING" };
  }

  const schema = detectSchema(rows);
  const row = findValidatedRow(rows, schema, rowKey);
  if (!row) {
    attempts.push({ accountId: rowKey, result: "NO_ROW" });
    return { ...base, attempts, normalized: null, displayState: "MISSING" };
  }

  const raw = pickColumn(row, column);
  const value = parseAmount(raw);

  if (value !== null) {
    attempts.push({ accountId: rowKey, result: "HIT" });
    return {
      ...base,
      attempts,
      hit: { accountId: rowKey, accountNm: row.se, sjDiv: "", rawValue: raw ?? "", ord: schema.rowIndex[rowKey] },
      normalized: value,
      displayState: "OK",
    };
  }

  attempts.push({ accountId: rowKey, result: "EMPTY_VALUE" });

  // 배당 관련 행이 "-"인 경우 순이익 행 값 존재 여부로 판정 (#22 #23 #24).
  if (rowKey === "dps_common" || rowKey === "yield_common" || rowKey === "payout") {
    const netIncomeValue = parseAmount(pickColumn(findValidatedRow(rows, schema, "net_income"), column));
    if (netIncomeValue !== null) {
      if (rowKey === "payout" && netIncomeValue <= 0) {
        // 순이익이 음수라 배당성향 산출 자체가 불가 (카카오 2023 실증).
        return { ...base, attempts, normalized: null, displayState: "NA_NEGATIVE_BASE" };
      }
      // 순이익은 있는데 배당 관련 행이 "-" → 무배당이 확인된 것 (셀트리온/헬릭스미스류).
      return { ...base, attempts, normalized: 0, displayState: "ZERO_BY_FACT" };
    }
  }

  return { ...base, attempts, normalized: null, displayState: "MISSING" };
}

/**
 * 배당성향 fallback = 현금배당금총액(idx4) ÷ (연결)당기순이익(idx1) × 100.
 * `payout`(idx6)이 이미 있어도 화면 방어용으로 항상 함께 계산해 둔다. 순이익 음수면 NA_NEGATIVE_BASE.
 */
export function resolveDividendPayoutFallback(
  envelope: DartEnvelope<AlotBody> | null,
  column: AlotColumn,
  fsDiv: "CFS" | "OFS",
  fsDivFallbackApplied: boolean,
): Resolution {
  const metricKey = "dividend_payout_fallback";
  const attempts: Resolution["attempts"] = [];
  const base = { metricKey, fsDiv, fsDivFallbackApplied, parserVersion: PARSER_VERSION };

  const rows = envelope?.body.status === "000" ? (envelope.body.list ?? []) : [];
  if (rows.length === 0) {
    attempts.push({ accountId: "net_income", result: "NO_ROW" });
    return { ...base, attempts, normalized: null, displayState: "MISSING" };
  }

  const schema = detectSchema(rows);
  const netIncomeRow = findValidatedRow(rows, schema, "net_income");
  const netIncome = parseAmount(pickColumn(netIncomeRow, column));

  if (netIncome === null) {
    attempts.push({ accountId: "net_income", result: netIncomeRow ? "EMPTY_VALUE" : "NO_ROW" });
    return { ...base, attempts, normalized: null, displayState: "MISSING" };
  }
  attempts.push({ accountId: "net_income", result: "HIT" });

  if (netIncome <= 0) {
    return { ...base, attempts, normalized: null, displayState: "NA_NEGATIVE_BASE" };
  }

  const dividendRow = findValidatedRow(rows, schema, "dividend_total");
  const dividendTotal = parseAmount(pickColumn(dividendRow, column));

  if (dividendTotal === null) {
    attempts.push({ accountId: "dividend_total", result: dividendRow ? "EMPTY_VALUE" : "NO_ROW" });
    // 순이익 > 0인데 배당총액이 "-" → 무배당 확인.
    return { ...base, attempts, normalized: 0, displayState: "ZERO_BY_FACT" };
  }
  attempts.push({ accountId: "dividend_total", result: "HIT" });

  const value = (dividendTotal / netIncome) * 100;
  return {
    ...base,
    attempts,
    // T10 리뷰 픽스: 예전엔 여기에 합성 accountId("dividend_total/net_income")를 가진 hit을
    // 채웠다 — alotMatter 원본 어떤 행도 se === "배당성향(fallback)"이 아니라서
    // SourcePanel의 "원문 보기 › 사용된 행만 보기"가 항상 0건으로 보이는 이슈(T5 이월)였다.
    // 두 행(배당총액·순이익)을 합성한 값이라 단일 hit row 개념 자체가 안 맞는다 — derive.ts의
    // deriveQ4/deriveRoa 등 다른 파생 지표들과 동일하게 hit을 비워 두고 derivation 문자열
    // (아래)로만 계산식을 남긴다. NormalizeTab은 hit 없으면 "정규화된 원장 값 없음"을 보여주고
    // 폴백/파생 탭으로 안내한다 — 이미 검증된 기존 동작(정보 손실 없음).
    normalized: value,
    displayState: "OK",
    derivation: `배당성향(fallback) = ${dividendTotal.toLocaleString("en-US")} ÷ ${netIncome.toLocaleString("en-US")} × 100`,
    // v3 V5 — 두 피연산자는 alotMatter 원본이 **백만원 단위**로 공시한 값이다("현금배당금총액(백만원)"
    // "당기순이익(백만원)" 라벨이 원문 그대로다). 원 단위로 오해하면 화면 환산이 10^6배 어긋난다.
    derivationDetail: {
      kind: "dividend_payout_fallback",
      resultLabel: "배당성향(fallback)",
      steps: [
        { label: "현금배당금총액", value: dividendTotal, unit: "KRW_MILLION" },
        { label: "당기순이익(배당공시 기준)", value: netIncome, op: "div", unit: "KRW_MILLION" },
        { label: "백분율 환산", value: 100, op: "mul", unit: "SCALAR" },
      ],
      unit: "PCT",
      caveat: "DART 자체 산출 배당성향(dividend_payout_indx, M451000)과는 분모 기준이 달라 값이 갈릴 수 있는 별개 산식이다",
    },
  };
}
