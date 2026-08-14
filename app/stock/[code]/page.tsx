import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";

import LineChart from "@/components/charts/LineChart";
import type { LineChartPoint } from "@/components/charts/LineChart";
import OverlaidBars from "@/components/charts/OverlaidBars";
import type { OverlaidBar } from "@/components/charts/OverlaidBars";
import PnlWaterfall from "@/components/charts/PnlWaterfall";
import SignedGroupedBars from "@/components/charts/SignedGroupedBars";
import type { SignedGroupedBarsGroup } from "@/components/charts/SignedGroupedBars";
import StackedBar100 from "@/components/charts/StackedBar100";
import StackedBarsAbs from "@/components/charts/StackedBarsAbs";
import type { StackedBarsAbsBar } from "@/components/charts/StackedBarsAbs";
import ZeroAxisBars from "@/components/charts/ZeroAxisBars";
import type { ZeroAxisBar } from "@/components/charts/ZeroAxisBars";
import FormulaPanel from "@/components/FormulaPanel";
import type { FormulaEntry } from "@/components/FormulaPanel";
import MetricValue from "@/components/MetricValue";
import type { MetricValueProps } from "@/components/MetricValue";
import { SourceCollapse } from "@/components/SourceCollapse";
import SourcePanel from "@/components/SourcePanel";
import { CATEGORY_PALETTE, GREEN, LOSS } from "@/components/charts/chartTheme";
import { formatEstDt, loadCompany } from "@/lib/company";
import { caveatTone } from "@/lib/derivationText";
import { toEok } from "@/lib/format";
import { metricDoc } from "@/lib/metricDocs";
import type { MetricDoc } from "@/lib/metricDocs";
import type { QuarterResolutions } from "@/lib/normalize/engine";
import type { DisplayState, ProfileId, Resolution } from "@/lib/normalize/types";
import { ALL_ANNUAL_YEARS, LATEST_ANNUAL_YEAR, LATEST_QUARTER_HEADER_LABEL, quarterAxisLabel } from "@/lib/period";
import {
  findProfileMetric,
  pnlKeysOnlyIn,
  PROFILE_CATALOG,
  resolveDisplay,
  summarizeCoverage,
  summarizePnlCoverage,
  withDisplayState,
} from "@/lib/profiles";
import type { ProfileMetric } from "@/lib/profiles";
import { basisLabel, buildSourcePanelProps } from "@/lib/sourcePanelHelpers";
import { loadStockQuartersWithFinExtras, loadStockYearView, profileIdOf, UNIVERSE } from "@/lib/stockView";
import type { StockYearView, UniverseRow } from "@/lib/stockView";

import styles from "./page.module.css";

/**
 * T10 — 종목 상세(/stock/[code]). 20종목 전부 이 파일 하나로 렌더된다 — 종목별 분기 없이
 * lib/profiles.ts의 PROFILE_CATALOG를 순회해서 표준/금융 화면 차이를 만들어 낸다
 * (compare/pnl의 조립 패턴을 20종목으로 일반화). 서버 컴포넌트.
 *
 * v2 T4/T5 — 연도는 더 이상 고정하지 않는다. 기준연도·최신 분기는 lib/period.ts 단일 정의를
 * 쓴다(기간 토글 UI 자체는 여전히 프로토타입 범위 밖). 표준 프로필(②~⑦)은 T2가 만든 분기 축
 * (quarters[])·QoQ/YoY를 이용해 손익 섹션에 분기 막대·성장률 꺾은선을 추가하고, 재무상태를
 * 누적 막대, 현금흐름을 ± 막대, 수익성·안정성·주주환원에 각각 꺾은선/겹침 막대를 붙였다.
 * 금융 프로필(FIN_*)의 손익 섹션(스택형)은 이번 범위 밖(T6) — 그대로 유지한다.
 */

const PROFILE_LABEL: Record<ProfileId, string> = {
  STANDARD: "표준",
  FIN_HOLDING: "금융·지주",
  FIN_BANK: "금융·은행",
  FIN_SECURITIES: "금융·증권",
  FIN_INSURANCE: "금융·보험",
};

export function generateStaticParams() {
  return UNIVERSE.map((row) => ({ code: row.stockCode }));
}

// 유니버스 20종목 외 경로는 정적 생성도, 요청 시 즉석 렌더도 하지 않는다 — 즉시 404.
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const row = UNIVERSE.find((r) => r.stockCode === code);
  return { title: row ? `${row.name}(${row.stockCode}) — 이띠 DART 프로토타입` : "종목 상세" };
}

/* ------------------------------------------------------------------------ */
/* 공용 렌더링 헬퍼 — MetricValue + SourcePanel을 항상 한 벌로 묶는다(단일 진입점 원칙).       */
/* ------------------------------------------------------------------------ */

function toDisplayValue(normalized: number, unit: NonNullable<MetricValueProps["unit"]>): number {
  return unit === "KRW" ? toEok(normalized) : normalized;
}

/** v2 T6 — BIS비율·NPL비율·NCR·K-ICS비율은 DART API가 통계자료로 제공하지 않지만(§1 xlsx
 *  근거), 원문이 어디 있는지는 안다: 사업보고서 "5. 재무건전성 등 기타참고사항" 섹션(DART API
 *  미제공 범위 밖 — 이 프로토타입은 원문 파싱을 하지 않는다, 정직하게 SOURCE_NOT_AVAILABLE
 *  유지 + 참조 경로만 note에 남긴다). */
const STABILITY_SOURCE_NOT_AVAILABLE_KEYS = new Set(["bis_ratio", "npl_ratio", "ncr", "kics"]);

/** 상태별 공통 보충 설명 — 종목·지표에 무관하게 항상 같은 문구를 쓴다(하드코딩 아니라 상태+키 기반). */
function defaultNoteFor(state: DisplayState, profile: ProfileId, metricKey?: string): string | undefined {
  switch (state) {
    case "NOT_IN_PROFILE":
      return `${PROFILE_LABEL[profile]} 프로필 해당 없음`;
    case "SOURCE_NOT_AVAILABLE":
      return metricKey && STABILITY_SOURCE_NOT_AVAILABLE_KEYS.has(metricKey) ? "DART 미제공 — 사업보고서 5. 재무건전성 등 기타참고사항(원문) 참조" : "DART 미제공";
    case "NA_NEGATIVE_BASE":
      return "분모 음수";
    default:
      return undefined;
  }
}

function FieldRow({
  label,
  state,
  value,
  unit,
  panelUnit,
  note,
  basis,
  metricKey,
  corpCode,
  profile,
  year,
  resolution,
  docOverride,
}: {
  label: string;
  state: DisplayState;
  value?: number;
  unit: NonNullable<MetricValueProps["unit"]>;
  panelUnit: "KRW" | "PCT" | "X";
  note?: string;
  basis?: "연결" | "별도";
  metricKey: string;
  corpCode: string;
  /** buildSourcePanelProps가 프로필 확장 카탈로그(FIN_HOLDING/FIN_SECURITIES/FIN_INSURANCE)에서
   *  같은 key라도 프로필별로 다른 account_id 정의를 찾도록 항상 넘긴다(리뷰 픽스 라운드 1). */
  profile: ProfileId;
  /** v2 T4 — 모듈 상수 캡처 대신 호출부가 명시한다(리뷰 픽스: FieldRow/TraceOnly가 YEAR를
   *  직접 캡처하던 구조를 prop화 — 연간 화면은 LATEST_ANNUAL_YEAR를 넘긴다). */
  year: string;
  resolution?: Resolution;
  /** v3 V5 — 프로필 카탈로그에 항목별 설명이 있으면 전역 METRIC_DOCS보다 우선한다. */
  docOverride?: MetricDoc;
}) {
  // v3 V5 — 산식은 라벨 문자열에 박지 않고 카탈로그에서 읽어 값 아래 한 줄로 보여준다.
  // 설명(description)은 라벨 툴팁으로 돌린다 — 20여 개 필드에 전부 인라인으로 깔면 V4가 줄여
  // 놓은 세로 길이를 도로 까먹기 때문이다(자세한 논리구조는 docs/specs/2608_metric-formulas.md).
  const doc = metricDoc(metricKey, docOverride);
  const detail = resolution?.derivationDetail;
  const caveat = detail?.caveat;
  // 규약 설명(현금흐름 누적 신고 등)은 ⚠가 아니라 ℹ로 내린다 — 무조건 붙는 안내가 진짜 경고
  // (계정 불일치·EPS 근사·CAPEX 부호)를 묻어 버린다(lib/derivationText.ts `caveatTone`).
  const tone = detail ? caveatTone(detail) : "warning";
  return (
    <div className={styles.field}>
      <div className={doc?.description ? `${styles.fieldLabel} ${styles.fieldLabelDoc}` : styles.fieldLabel} title={doc?.description}>
        {label}
      </div>
      <MetricValue state={state} value={value} unit={unit} basis={basis} note={note} />
      {doc?.formula && <div className={styles.fieldFormula}>산식 {doc.formula}</div>}
      {caveat && (
        <div className={tone === "warning" ? styles.fieldCaveat : styles.fieldNote}>
          {tone === "warning" ? "⚠" : "ℹ"} {caveat}
        </div>
      )}
      {resolution && <SourcePanel {...buildSourcePanelProps(metricKey, corpCode, year, withDisplayState(resolution, state), panelUnit, profile)} />}
    </div>
  );
}

/** 프로필 카탈로그(pnl/stability)에 등록된 지표 — NOT_IN_PROFILE/SOURCE_NOT_AVAILABLE 판정을 거친다. */
function GatedField({ profile, corpCode, year, metric, resolution }: { profile: ProfileId; corpCode: string; year: string; metric: ProfileMetric; resolution?: Resolution }) {
  const state = resolveDisplay(profile, metric.key, resolution);
  const value = state === "OK" && resolution?.normalized != null ? toDisplayValue(resolution.normalized, metric.unit) : undefined;
  return (
    <FieldRow
      label={metric.label}
      state={state}
      value={value}
      unit={metric.unit}
      panelUnit={metric.unit}
      note={defaultNoteFor(state, profile, metric.key)}
      basis={resolution ? basisLabel(resolution.fsDiv) : undefined}
      metricKey={metric.key}
      corpCode={corpCode}
      profile={profile}
      year={year}
      resolution={resolution}
      docOverride={metric}
    />
  );
}

/** 카탈로그에 없는 보편 지표(ROE·ROA·EPS·DPS·자산총계 등) — 모든 프로필에 동일 개념으로 존재해 프로필 게이팅을 거치지 않는다.
 *  단, buildSourcePanelProps가 원천을 판별할 때는 profile을 그대로 넘긴다 — 이 지표들은 전부
 *  BASE_CANDIDATES(4원천 공용, 전역 유일 key)에 있어 실제로는 profile에 안 좌우되지만, 호출부
 *  전부가 항상 profile을 넘기는 하나의 계약을 유지해야 향후 확장 카탈로그에 우연히 같은 key가
 *  추가돼도 조용히 잘못된 정의를 찾는 사고가 재발하지 않는다. */
function RawField({
  corpCode,
  profile,
  year,
  metricKey,
  label,
  unit,
  panelUnit,
  resolution,
  zeroByFactNote,
  conflictNote,
}: {
  corpCode: string;
  profile: ProfileId;
  year: string;
  metricKey: string;
  label: string;
  unit: NonNullable<MetricValueProps["unit"]>;
  panelUnit: "KRW" | "PCT" | "X";
  resolution?: Resolution;
  /** ZERO_BY_FACT일 때 보여줄 문구 — 배당 계열 지표에서 "무배당 확인"으로 쓰인다. */
  zeroByFactNote?: string;
  /** 리뷰 픽스(I2) — 상태와 무관하게 최우선으로 노출되는 주석(두 배당성향 값의 산출 기준이
   *  달라 상충할 때). 다른 note 로직보다 우선한다. */
  conflictNote?: string;
}) {
  const state = resolution?.displayState ?? "MISSING";
  const value = state === "OK" && resolution?.normalized != null ? toDisplayValue(resolution.normalized, unit) : undefined;
  const note = conflictNote ?? (state === "ZERO_BY_FACT" ? zeroByFactNote : state === "NA_NEGATIVE_BASE" ? "분모 음수" : undefined);
  return (
    <FieldRow
      label={label}
      state={state}
      value={value}
      unit={unit}
      panelUnit={panelUnit}
      note={note}
      basis={resolution ? basisLabel(resolution.fsDiv) : undefined}
      metricKey={metricKey}
      corpCode={corpCode}
      profile={profile}
      year={year}
      resolution={resolution}
    />
  );
}

/** 차트가 이미 값을 그린 지표용 — 중복 숫자 표기 없이 출처 collapse만 붙인다(compare/pnl TraceRow와 동일 패턴). */
function TraceOnly({ profile, corpCode, year, metric, resolution }: { profile: ProfileId; corpCode: string; year: string; metric: ProfileMetric; resolution?: Resolution }) {
  if (!resolution) return null;
  const state = resolveDisplay(profile, metric.key, resolution);
  return (
    <div className={styles.field}>
      <div className={styles.fieldLabel}>{metric.label}</div>
      <SourcePanel {...buildSourcePanelProps(metric.key, corpCode, year, withDisplayState(resolution, state), metric.unit, profile)} />
    </div>
  );
}

function eok(resolution: Resolution | undefined): number | null {
  return resolution?.normalized != null ? toEok(resolution.normalized) : null;
}

/**
 * 리뷰 픽스(I2) — 배당성향 두 원천(dividend_payout_indx: DART 자체 산출 M451000 vs
 * dividend_payout_fallback: 배당총액÷지배주주 귀속 순이익)의 부호가 다르거나 10%p 이상
 * 벌어지면 두 값 모두 "산출 기준이 다르다"는 배지를 붙인다. 카카오처럼 특정 종목을 하드코딩해
 * 분기하지 않고 실측 Resolution 값만으로 판정한다 — 조건에 해당하지 않는 종목은 배지가 뜨지
 * 않는다.
 */
const DIVIDEND_PAYOUT_CONFLICT_NOTE = "산출 기준 상이 — 지표는 DART 자체 산출(총액 기준 추정), fallback은 배당총액÷지배주주 귀속 순이익";
const DIVIDEND_PAYOUT_CONFLICT_GAP_PP = 10;

function dividendPayoutConflictNote(indx: Resolution | undefined, fallback: Resolution | undefined): string | undefined {
  if (indx?.displayState !== "OK" || fallback?.displayState !== "OK") return undefined;
  const a = indx.normalized;
  const b = fallback.normalized;
  if (a == null || b == null) return undefined;
  const signDiffers = a < 0 !== b < 0;
  const gapOverThreshold = Math.abs(a - b) >= DIVIDEND_PAYOUT_CONFLICT_GAP_PP;
  return signDiffers || gapOverThreshold ? DIVIDEND_PAYOUT_CONFLICT_NOTE : undefined;
}

/* ------------------------------------------------------------------------ */
/* v2 T5 — 분기 차트 헬퍼(②만 사용). 분기 윈도는 데이터 주도로 자른다 — 하드코딩 분기 목록 금지. */
/* ------------------------------------------------------------------------ */

const QUARTER_WINDOW_MAX = 8;

/**
 * growth(QoQ/YoY) displayState → LineChart의 `state` 칩 문구. `components/MetricValue.tsx`의
 * `renderText()`가 정본이다(TURN_TO_PROFIT/TURN_TO_LOSS/LOSS_CONTINUED) — LineChart.tsx doc이
 * "여기서 새 문구를 짓지 말 것"이라 명시해 그 정본과 완전히 같은 3개 문구만 이 표에 담는다.
 */
const GROWTH_STATE_CHIP: Partial<Record<DisplayState, string>> = {
  TURN_TO_PROFIT: "흑자전환",
  TURN_TO_LOSS: "적자전환",
  LOSS_CONTINUED: "적자지속",
};

/**
 * 분기 윈도를 데이터 주도로 자른다(브리프 명시 — 하드코딩 분기 목록 금지). `referenceKey`의
 * displayState가 MISSING이 아닌 마지막 분기를 찾아 그 지점까지 최근 `maxN`개를 반환한다. 윈도
 * 안에 다른 키의 MISSING이 섞여 있어도(예: 신영증권 2023Q1) 차트가 null을 자리 표시로 그리므로
 * 문제 없다 — 여러 분기 차트가 같은 윈도(같은 x축)를 공유하도록 이 함수는 대표 키(revenue) 한
 * 번만 호출한다.
 */
function latestQuarterWindow(quarters: QuarterResolutions[], referenceKey: string, maxN: number = QUARTER_WINDOW_MAX): QuarterResolutions[] {
  let lastIdx = -1;
  quarters.forEach((q, i) => {
    if (q.resolutions[referenceKey]?.displayState && q.resolutions[referenceKey]?.displayState !== "MISSING") lastIdx = i;
  });
  if (lastIdx === -1) return [];
  return quarters.slice(Math.max(0, lastIdx - maxN + 1), lastIdx + 1);
}

/* ------------------------------------------------------------------------ */
/* v3 V5 — 산식 패널(FormulaPanel) 입력 조립. 기간 라벨은 차트 x축과 **같은 문자열**을 쓴다 —
   패널의 "24.4Q 영업이익 …" 한 줄이 차트의 어느 막대를 가리키는지 눈으로 바로 이어져야 한다. */
/* ------------------------------------------------------------------------ */

function quarterFormulaEntries(quarters: QuarterResolutions[], resolutionKey: string, accMt: string): FormulaEntry[] {
  return quarters.flatMap((q) => {
    const resolution = q.resolutions[resolutionKey];
    return resolution ? [{ periodLabel: quarterAxisLabel(q.bsnsYear, q.quarter, accMt, q.fiscalPeriodName), resolution }] : [];
  });
}

function annualFormulaEntries(years: StockYearView[], key: string): FormulaEntry[] {
  return years.flatMap((y) => {
    const resolution = y.resolutions[key];
    return resolution ? [{ periodLabel: `${y.year.slice(2)}년`, resolution }] : [];
  });
}

/** 분기 금액 막대(ZeroAxisBars) — unit "WON"이면 억원 환산 없이 원 단위 그대로 쓴다(EPS 전용,
 *  MetricValue의 WON 관례와 동일 — 억원으로 바꾸면 "0.00001116억원"처럼 오표기된다). */
function quarterZeroAxisBars(quarters: QuarterResolutions[], key: string, accMt: string, unit: "KRW" | "WON"): ZeroAxisBar[] {
  return quarters.map((q) => {
    const r = q.resolutions[key];
    const value = unit === "WON" ? (r?.normalized ?? null) : eok(r);
    return { label: quarterAxisLabel(q.bsnsYear, q.quarter, accMt, q.fiscalPeriodName), value, provisional: r?.provisional };
  });
}

/** QoQ/YoY LineChart 포인트 — state 칩은 GROWTH_STATE_CHIP 정본만 사용, 값은 PCT 그대로(eok 변환 없음). */
function quarterGrowthPoints(quarters: QuarterResolutions[], growthKey: string, accMt: string): LineChartPoint[] {
  return quarters.map((q) => {
    const label = quarterAxisLabel(q.bsnsYear, q.quarter, accMt, q.fiscalPeriodName);
    const r = q.resolutions[growthKey];
    if (!r) return { label, value: null };
    return { label, value: r.normalized, provisional: r.provisional, state: GROWTH_STATE_CHIP[r.displayState] };
  });
}

/**
 * TraceOnly의 분기 버전 — 분기 차트의 SourcePanel 부착에 쓴다(브리프 명시 "분기 차트는 해당
 * reprt 스냅샷 requestId로"). `sourceMetricKey`(기본값 resolutionKey)로 원천 후보를 찾고
 * `resolutionKey`로 실제 표시할 Resolution을 찾는다 — QoQ/YoY처럼 자체 후보가 없는 파생
 * 지표는 기저 지표(revenue 등)의 acntAll 스냅샷을 그대로 가리키게 하기 위해 둘을 분리했다
 * (파생 계산식 자체는 resolution.derivation에 남아 SourcePanel "파생" 탭에 그대로 보인다).
 */
function QuarterTraceOnly({
  profile,
  corpCode,
  label,
  sourceMetricKey,
  unit,
  quarter,
  resolution,
}: {
  profile: ProfileId;
  corpCode: string;
  label: string;
  sourceMetricKey: string;
  unit: "KRW" | "PCT" | "X";
  quarter: QuarterResolutions;
  resolution?: Resolution;
}) {
  if (!resolution) return null;
  return (
    <div className={styles.field}>
      <div className={styles.fieldLabel}>{label}</div>
      {/* bsnsYear가 아니라 sourceYear를 넘긴다 — 비12월 결산 종목의 Q4는 다음 해 사업보고서를 짝으로
          쓰므로(engine.ts detectAnnualYearOffset) bsnsYear로 조립하면 실제로 읽지 않은 스냅샷을 근거로
          제시하게 된다. 12월 결산 종목은 두 값이 항상 같아 영향 없다. */}
      <SourcePanel {...buildSourcePanelProps(sourceMetricKey, corpCode, quarter.sourceYear, resolution, unit, profile, quarter.reprtCode)} />
    </div>
  );
}

/**
 * 분기 윈도 전체(최대 8개)에 대해 QuarterTraceOnly를 반복 — v3 V4부터 개별 fieldList 대신
 * SourceCollapse 하나로 묶는다(차트당 카드 8개가 화면을 파묻는 문제, 브리프 §V4). count는
 * quarters.length가 아니라 실제로 resolution이 있어(=카드가 렌더되는) 분기 수로 센다 —
 * QuarterTraceOnly는 resolution이 없으면 null을 반환하므로 quarters.length를 그대로 쓰면
 * "출처 8건"인데 실제로는 6장뿐인 과대 표기가 생긴다.
 */
function QuarterSourceRow({
  profile,
  corpCode,
  accMt,
  quarters,
  resolutionKey,
  sourceMetricKey = resolutionKey,
  unit,
}: {
  profile: ProfileId;
  corpCode: string;
  accMt: string;
  quarters: QuarterResolutions[];
  resolutionKey: string;
  sourceMetricKey?: string;
  unit: "KRW" | "PCT" | "X";
}) {
  const count = quarters.filter((q) => q.resolutions[resolutionKey]).length;
  return (
    // v3 V5 — V4가 비워 둔 formulaSlot을 채운다. 산식이 없는 직독 지표(BS 등)면 FormulaPanel이
    // 스스로 null을 반환해 슬롯이 사라지므로 호출부에서 분기할 필요가 없다.
    <SourceCollapse count={count} formulaSlot={<FormulaPanel entries={quarterFormulaEntries(quarters, resolutionKey, accMt)} />}>
      {quarters.map((q) => (
        <QuarterTraceOnly
          key={q.period}
          profile={profile}
          corpCode={corpCode}
          label={quarterAxisLabel(q.bsnsYear, q.quarter, accMt, q.fiscalPeriodName)}
          sourceMetricKey={sourceMetricKey}
          unit={unit}
          quarter={q}
          resolution={q.resolutions[resolutionKey]}
        />
      ))}
    </SourceCollapse>
  );
}

/* ------------------------------------------------------------------------ */
/* 섹션                                                                       */
/* ------------------------------------------------------------------------ */

function OverviewSection({ row, profile }: { row: UniverseRow; profile: ProfileId }) {
  const envelope = loadCompany(row.stockCode);
  const company = envelope.body;
  return (
    <section className={styles.section}>
      <h2>① 개요</h2>
      <dl className={styles.overviewGrid}>
        <dt>대표이사</dt>
        <dd>{company.ceo_nm || "데이터 없음"}</dd>
        <dt>업종코드</dt>
        <dd className="mono">
          {company.induty_code} (KSIC {row.ksic2})
        </dd>
        <dt>설립일</dt>
        <dd>{formatEstDt(company.est_dt)}</dd>
        <dt>결산월</dt>
        <dd className={row.accMt !== "12" ? styles.highlight : undefined}>{row.accMt}월</dd>
        <dt>법인구분</dt>
        <dd>{company.corp_cls === "Y" ? "유가증권" : company.corp_cls === "K" ? "코스닥" : company.corp_cls}</dd>
        <dt>손익구조 프로필</dt>
        <dd>
          {PROFILE_LABEL[profile]} ({row.profileSource === "MANUAL" ? "수동 확정" : "자동(KSIC)"})
        </dd>
      </dl>
      <p className={styles.noteText}>T2 실증 포인트: {row.note}</p>
      <details className={styles.rawDetails}>
        <summary>원본 company.json</summary>
        <pre className={styles.pre}>{JSON.stringify(company, null, 2)}</pre>
      </details>
    </section>
  );
}

function PnlSection({
  profile,
  corpCode,
  years,
  quarters,
  accMt,
}: {
  profile: ProfileId;
  corpCode: string;
  years: StockYearView[];
  quarters: QuarterResolutions[];
  accMt: string;
}) {
  const yLatest = years.find((y) => y.year === LATEST_ANNUAL_YEAR)!;
  const coverage = summarizePnlCoverage(profile, yLatest.resolutions);

  if (profile === "STANDARD") {
    const waterfallMetrics = PROFILE_CATALOG.STANDARD.pnl.filter((m) => m.chart === "waterfall");
    const waterfallRows = waterfallMetrics.map((metric) => {
      const resolution = yLatest.resolutions[metric.key];
      const state = resolveDisplay("STANDARD", metric.key, resolution);
      const value = state === "OK" && resolution?.normalized != null ? toEok(resolution.normalized) : null;
      return { metric, resolution, value };
    });
    const baseValue = waterfallRows[0]?.value ?? null;
    const chartRows = waterfallRows.map((r) => ({
      label: r.metric.label,
      value: r.value,
      ratioPct: r.value !== null && baseValue !== null && baseValue !== 0 ? (r.value / baseValue) * 100 : null,
    }));
    const ratioMetrics = PROFILE_CATALOG.STANDARD.pnl.filter((m) => m.chart === "none");

    // v2 T5 — 분기 막대 4개 + YoY 꺾은선 2개 + QoQ 꺾은선 1개. 4개 바 차트가 같은 x축을 쓰도록
    // revenue의 데이터 유무로 정한 윈도 하나를 전부 재사용한다(하드코딩 분기 목록 금지).
    const quarterWindow = latestQuarterWindow(quarters, "revenue", QUARTER_WINDOW_MAX);
    const revenueBars = quarterZeroAxisBars(quarterWindow, "revenue", accMt, "KRW");
    const operatingIncomeBars = quarterZeroAxisBars(quarterWindow, "operating_income", accMt, "KRW");
    const netIncomeAttrBars = quarterZeroAxisBars(quarterWindow, "net_income_attributable_to_owners", accMt, "KRW");
    const epsBars = quarterZeroAxisBars(quarterWindow, "eps_basic", accMt, "WON");
    const yoyRevenuePoints = quarterGrowthPoints(quarterWindow, "yoy_revenue", accMt);
    const yoyOperatingIncomePoints = quarterGrowthPoints(quarterWindow, "yoy_operating_income", accMt);
    const qoqOperatingIncomePoints = quarterGrowthPoints(quarterWindow, "qoq_operating_income", accMt);

    return (
      <section className={styles.section}>
        <h2>② 손익</h2>
        <div className={styles.sectionTitle}>
          손익 구조 — {LATEST_ANNUAL_YEAR} · {basisLabel(yLatest.fsDiv)} · 억원
        </div>
        <PnlWaterfall rows={chartRows} />
        <SourceCollapse count={waterfallRows.filter((r) => r.resolution).length}>
          {waterfallRows.map(({ metric, resolution }) => (
            <TraceOnly key={metric.key} profile={profile} corpCode={corpCode} year={LATEST_ANNUAL_YEAR} metric={metric} resolution={resolution} />
          ))}
        </SourceCollapse>
        <div className={styles.fieldList}>
          {ratioMetrics.map((metric) => (
            <GatedField key={metric.key} profile={profile} corpCode={corpCode} year={LATEST_ANNUAL_YEAR} metric={metric} resolution={yLatest.resolutions[metric.key]} />
          ))}
        </div>

        <div className={styles.sectionTitle}>매출액 — 최근 {quarterWindow.length}분기 · 억원 · 0 기준선(적자는 아래)</div>
        <ZeroAxisBars bars={revenueBars} unit="억원" compactLabels />
        <QuarterSourceRow profile={profile} corpCode={corpCode} accMt={accMt} quarters={quarterWindow} resolutionKey="revenue" unit="KRW" />

        <div className={styles.sectionTitle}>영업이익 — 최근 {quarterWindow.length}분기 · 억원</div>
        <ZeroAxisBars bars={operatingIncomeBars} unit="억원" compactLabels />
        <QuarterSourceRow profile={profile} corpCode={corpCode} accMt={accMt} quarters={quarterWindow} resolutionKey="operating_income" unit="KRW" />

        <div className={styles.sectionTitle}>당기순이익(지배주주) — 최근 {quarterWindow.length}분기 · 억원</div>
        <ZeroAxisBars bars={netIncomeAttrBars} unit="억원" compactLabels />
        <QuarterSourceRow profile={profile} corpCode={corpCode} accMt={accMt} quarters={quarterWindow} resolutionKey="net_income_attributable_to_owners" unit="KRW" />

        <div className={styles.sectionTitle}>기본주당이익(EPS) — 최근 {quarterWindow.length}분기 · 원</div>
        <ZeroAxisBars bars={epsBars} unit="원" compactLabels />
        <QuarterSourceRow profile={profile} corpCode={corpCode} accMt={accMt} quarters={quarterWindow} resolutionKey="eps_basic" unit="KRW" />

        <div className={styles.sectionTitle}>매출액 YoY — 전년 동분기 대비 · % · 0% 기준선</div>
        <LineChart points={yoyRevenuePoints} unit="%" sign baseline={{ value: 0, label: "0% 기준선" }} />
        <QuarterSourceRow profile={profile} corpCode={corpCode} accMt={accMt} quarters={quarterWindow} resolutionKey="yoy_revenue" sourceMetricKey="revenue" unit="KRW" />

        <div className={styles.sectionTitle}>영업이익 YoY — 전년 동분기 대비 · % · 0% 기준선</div>
        <LineChart points={yoyOperatingIncomePoints} unit="%" sign baseline={{ value: 0, label: "0% 기준선" }} color={CATEGORY_PALETTE[1]} />
        <QuarterSourceRow profile={profile} corpCode={corpCode} accMt={accMt} quarters={quarterWindow} resolutionKey="yoy_operating_income" sourceMetricKey="operating_income" unit="KRW" />

        <div className={styles.sectionTitle}>영업이익 QoQ — 전분기 대비 · %</div>
        <LineChart points={qoqOperatingIncomePoints} unit="%" sign color={CATEGORY_PALETTE[2]} />
        <QuarterSourceRow profile={profile} corpCode={corpCode} accMt={accMt} quarters={quarterWindow} resolutionKey="qoq_operating_income" sourceMetricKey="operating_income" unit="KRW" />

        <div className={styles.coverageBox}>
          손익 후보 {coverage.total}개 중 {coverage.hit}개 존재
          {coverage.missing.length > 0 && <span className={styles.coverageMissing}> · 미존재: {coverage.missing.map((m) => `${m.label}(${m.state})`).join(", ")}</span>}
        </div>
      </section>
    );
  }

  // 금융 프로필(FIN_HOLDING/FIN_BANK/FIN_SECURITIES/FIN_INSURANCE) — StackedBar100 + 차감 구획.
  // v2 T5 범위 밖(브리프 명시 "금융 프로필은 T6") — 로직은 그대로 두고 year prop만 명시적으로 넘긴다.
  const stackedMetrics = PROFILE_CATALOG[profile].pnl.filter((m) => m.chart === "stacked");
  const deductionMetrics = PROFILE_CATALOG[profile].pnl.filter((m) => m.chart === "deduction");
  const referenceMetrics = PROFILE_CATALOG[profile].pnl.filter((m) => m.chart === "none");
  const naKeys = pnlKeysOnlyIn("STANDARD", profile);

  const segments: { label: string; value: number | null }[] = [];
  const negativeSegments: { metric: ProfileMetric; resolution: Resolution }[] = [];
  for (const metric of stackedMetrics) {
    const resolution = yLatest.resolutions[metric.key];
    const state = resolveDisplay(profile, metric.key, resolution);
    if (state === "OK" && resolution?.normalized != null && resolution.normalized > 0) {
      segments.push({ label: metric.label, value: toEok(resolution.normalized) });
    } else if (state === "OK" && resolution?.normalized != null && resolution.normalized <= 0) {
      negativeSegments.push({ metric, resolution });
    } else {
      segments.push({ label: metric.label, value: null });
    }
  }

  // v2 T6 — 금융 프로필 분기 차트: 대상 6종(영업이익·순이자손익·순수수료손익·보험손익·
  // 지배주주순이익·EPS) 전부 분기 막대 + YoY/QoQ 꺾은선. base 3종(operating_income·
  // net_income_attributable_to_owners·eps_basic)은 quarters[]에서 프로필 게이팅 없이 이미
  // 계산돼 있고(T2), fin 3종(net_interest_income·net_fee_income·insurance_result)은
  // loadStockQuartersWithFinExtras가 요청 시점에 병합해 넣었다(T6 신설) — 매출액이 없는 금융
  // 프로필에서는 "revenue" 대신 "operating_income"으로 윈도를 잡는다(STANDARD의 revenue 기준과
  // 동일 원리 — latestQuarterWindow는 대표 키 하나로 8분기 창을 정하고 나머지는 null로 채운다).
  const finQuarterWindow = latestQuarterWindow(quarters, "operating_income", QUARTER_WINDOW_MAX);
  const finQuarterMetrics: { key: string; unit: "KRW" | "WON"; fallbackLabel?: string }[] = [
    { key: "operating_income", unit: "KRW" },
    { key: "net_interest_income", unit: "KRW" },
    { key: "net_fee_income", unit: "KRW" },
    { key: "insurance_result", unit: "KRW" },
    { key: "net_income_attributable_to_owners", unit: "KRW" },
    { key: "eps_basic", unit: "WON", fallbackLabel: "기본주당이익(EPS)" },
  ];

  return (
    <section className={styles.section}>
      <h2>② 손익</h2>
      <div className={styles.sectionTitle}>
        손익 구성 — {LATEST_ANNUAL_YEAR} · {basisLabel(yLatest.fsDiv)} · 억원 (워터폴 없음 — 금융 프로필은 표준 손익계정 체계를 따르지 않는다)
      </div>
      <StackedBar100 segments={segments} />
      <SourceCollapse count={stackedMetrics.filter((m) => yLatest.resolutions[m.key]).length}>
        {stackedMetrics.map((metric) => (
          <TraceOnly key={metric.key} profile={profile} corpCode={corpCode} year={LATEST_ANNUAL_YEAR} metric={metric} resolution={yLatest.resolutions[metric.key]} />
        ))}
      </SourceCollapse>

      {deductionMetrics.length > 0 && (
        <div className={styles.deductionBlock}>
          <div className={styles.sectionTitle}>차감 항목 (스택 아님 — 순영업수익에서 차감되는 비용성 항목)</div>
          <div className={styles.fieldList}>
            {deductionMetrics.map((metric) => (
              <GatedField key={metric.key} profile={profile} corpCode={corpCode} year={LATEST_ANNUAL_YEAR} metric={metric} resolution={yLatest.resolutions[metric.key]} />
            ))}
          </div>
        </div>
      )}

      {negativeSegments.length > 0 && (
        <p className={styles.negativeNote}>
          음수/0 이하로 스택에서 제외됨(절대값 처리 안 함): {negativeSegments.map(({ metric, resolution }) => `${metric.label} ${resolution.normalized?.toLocaleString("ko-KR")}원`).join(", ")}
        </p>
      )}

      <div className={styles.sectionTitle}>참고 지표 (스택 세그먼트 아님 — 총계/총액)</div>
      <div className={styles.fieldList}>
        {referenceMetrics.map((metric) => (
          <GatedField key={metric.key} profile={profile} corpCode={corpCode} year={LATEST_ANNUAL_YEAR} metric={metric} resolution={yLatest.resolutions[metric.key]} />
        ))}
      </div>

      <div className={styles.sectionTitle}>분기 손익 — 최근 {finQuarterWindow.length}분기 · 지정 6종 · 분기 막대 + YoY/QoQ 꺾은선(0% 기준선) · 적자 분기는 기준선 아래 · 잠정치(Q4 역산)는 점선</div>
      {finQuarterMetrics.map(({ key, unit, fallbackLabel }) => {
        // 프로필 카탈로그에 없는 항목(예: 증권의 보험손익)은 findProfileMetric이 undefined를
        // 반환해 자동 제외된다(NOT_IN_PROFILE 게이팅) — eps_basic은 카탈로그에 없는 보편 지표라
        // 항상 렌더한다(⑦ 주주환원 섹션과 동일 취급).
        const metric = key === "eps_basic" ? undefined : findProfileMetric(profile, key);
        if (key !== "eps_basic" && !metric) return null;
        const label = metric?.label ?? fallbackLabel ?? key;
        const displayUnit = unit === "WON" ? "원" : "억원";
        const bars = quarterZeroAxisBars(finQuarterWindow, key, accMt, unit);
        const yoyPoints = quarterGrowthPoints(finQuarterWindow, `yoy_${key}`, accMt);
        const qoqPoints = quarterGrowthPoints(finQuarterWindow, `qoq_${key}`, accMt);
        return (
          <Fragment key={key}>
            <div className={styles.sectionTitle}>
              {label} — 최근 {finQuarterWindow.length}분기 · {displayUnit}
            </div>
            <ZeroAxisBars bars={bars} unit={displayUnit} compactLabels />
            <QuarterSourceRow profile={profile} corpCode={corpCode} accMt={accMt} quarters={finQuarterWindow} resolutionKey={key} unit="KRW" />

            <div className={styles.sectionTitle}>{label} YoY — 전년 동분기 대비 · % · 0% 기준선</div>
            <LineChart points={yoyPoints} unit="%" sign baseline={{ value: 0, label: "0% 기준선" }} />
            <QuarterSourceRow profile={profile} corpCode={corpCode} accMt={accMt} quarters={finQuarterWindow} resolutionKey={`yoy_${key}`} sourceMetricKey={key} unit="KRW" />

            <div className={styles.sectionTitle}>{label} QoQ — 전분기 대비 · %</div>
            <LineChart points={qoqPoints} unit="%" sign color={CATEGORY_PALETTE[2]} />
            <QuarterSourceRow profile={profile} corpCode={corpCode} accMt={accMt} quarters={finQuarterWindow} resolutionKey={`qoq_${key}`} sourceMetricKey={key} unit="KRW" />
          </Fragment>
        );
      })}

      {naKeys.length > 0 && (
        <div className={styles.naBlock}>
          <div className={styles.sectionTitle}>표준 프로필 전용 지표 (해당 없음)</div>
          <div className={styles.fieldList}>
            {naKeys.map((key) => {
              const metric = findProfileMetric("STANDARD", key);
              if (!metric) return null;
              return <GatedField key={key} profile={profile} corpCode={corpCode} year={LATEST_ANNUAL_YEAR} metric={metric} resolution={yLatest.resolutions[key]} />;
            })}
          </div>
        </div>
      )}

      <div className={styles.coverageBox}>
        손익 후보 {coverage.total}개 중 {coverage.hit}개 존재
        {coverage.missing.length > 0 && <span className={styles.coverageMissing}> · 미존재: {coverage.missing.map((m) => `${m.label}(${m.state})`).join(", ")}</span>}
      </div>
    </section>
  );
}

function BalanceSection({
  profile,
  corpCode,
  years,
  quarters,
  accMt,
}: {
  profile: ProfileId;
  corpCode: string;
  years: StockYearView[];
  quarters: QuarterResolutions[];
  accMt: string;
}) {
  const yLatest = years.find((y) => y.year === LATEST_ANNUAL_YEAR)!;
  // v2 T5 — 컨트롤러 확정 사항(§3): BS는 시점 데이터라 분기말 직독 가능 → 연간 3개년 + 최신
  // 분기말 1개. "최신"은 lib/period.ts 상수가 아니라 total_assets 실데이터로 직접 찾는다(자체
  // 교정 — 수집 상태가 바뀌어도 이 섹션은 항상 실제로 존재하는 가장 최근 분기를 그린다).
  const latestQuarter = latestQuarterWindow(quarters, "total_assets", 1)[0];
  const latestQuarterLabel = latestQuarter ? quarterAxisLabel(latestQuarter.bsnsYear, latestQuarter.quarter, accMt, latestQuarter.fiscalPeriodName) : undefined;

  // 자본=초록/부채=적색(opacity 0.55) — 학습가이드 stacked()의 ACCENT/NEG 배색과 동일(개선점 A).
  // 이 섹션은 표준·금융 두 프로필 페이지 모두에서 공유되므로(profile 값에 따라 데이터만 달라짐)
  // 호출부 1곳 수정으로 양쪽에 반영된다.
  const bsBars: StackedBarsAbsBar[] = years.map((y) => ({
    label: `${y.year.slice(2)}년`,
    segments: [
      { label: "자본", value: eok(y.resolutions.total_equity), color: GREEN },
      { label: "부채", value: eok(y.resolutions.total_liabilities), color: LOSS, opacity: 0.55 },
    ],
  }));
  if (latestQuarter && latestQuarterLabel) {
    bsBars.push({
      label: `${latestQuarterLabel}(잠정)`,
      segments: [
        { label: "자본", value: eok(latestQuarter.resolutions.total_equity), color: GREEN },
        { label: "부채", value: eok(latestQuarter.resolutions.total_liabilities), color: LOSS, opacity: 0.55 },
      ],
    });
  }

  return (
    <section className={styles.section}>
      <h2>③ 재무상태</h2>
      <div className={styles.sectionTitle}>자산 구성(자본+부채) — 연간 3개년(FY23~25) + 최신 분기말 · 억원 · 아래 자본 · 위 부채</div>
      <StackedBarsAbs bars={bsBars} />
      <SourceCollapse
        count={
          years.filter((y) => y.resolutions.total_equity).length +
          years.filter((y) => y.resolutions.total_liabilities).length +
          (latestQuarter?.resolutions.total_equity ? 1 : 0) +
          (latestQuarter?.resolutions.total_liabilities ? 1 : 0)
        }
      >
        {years.map((y) => (
          <TraceOnly
            key={`equity-${y.year}`}
            profile={profile}
            corpCode={corpCode}
            year={y.year}
            metric={{ key: "total_equity", label: `자본총계 ${y.year}`, sourceAvailable: true, unit: "KRW" }}
            resolution={y.resolutions.total_equity}
          />
        ))}
        {years.map((y) => (
          <TraceOnly
            key={`liab-${y.year}`}
            profile={profile}
            corpCode={corpCode}
            year={y.year}
            metric={{ key: "total_liabilities", label: `부채총계 ${y.year}`, sourceAvailable: true, unit: "KRW" }}
            resolution={y.resolutions.total_liabilities}
          />
        ))}
        {latestQuarter && latestQuarterLabel && (
          <>
            <QuarterTraceOnly
              profile={profile}
              corpCode={corpCode}
              label={`자본총계 ${latestQuarterLabel}`}
              sourceMetricKey="total_equity"
              unit="KRW"
              quarter={latestQuarter}
              resolution={latestQuarter.resolutions.total_equity}
            />
            <QuarterTraceOnly
              profile={profile}
              corpCode={corpCode}
              label={`부채총계 ${latestQuarterLabel}`}
              sourceMetricKey="total_liabilities"
              unit="KRW"
              quarter={latestQuarter}
              resolution={latestQuarter.resolutions.total_liabilities}
            />
          </>
        )}
      </SourceCollapse>
      <div className={styles.fieldList}>
        <RawField corpCode={corpCode} profile={profile} year={LATEST_ANNUAL_YEAR} metricKey="total_assets" label="자산총계" unit="KRW" panelUnit="KRW" resolution={yLatest.resolutions.total_assets} />
        <RawField
          corpCode={corpCode}
          profile={profile}
          year={LATEST_ANNUAL_YEAR}
          metricKey="total_liabilities"
          label="부채총계"
          unit="KRW"
          panelUnit="KRW"
          resolution={yLatest.resolutions.total_liabilities}
        />
        <RawField corpCode={corpCode} profile={profile} year={LATEST_ANNUAL_YEAR} metricKey="total_equity" label="자본총계" unit="KRW" panelUnit="KRW" resolution={yLatest.resolutions.total_equity} />
        <RawField
          corpCode={corpCode}
          profile={profile}
          year={LATEST_ANNUAL_YEAR}
          metricKey="equity_attributable_to_owners"
          label="지배주주지분"
          unit="KRW"
          panelUnit="KRW"
          resolution={yLatest.resolutions.equity_attributable_to_owners}
        />
      </div>
    </section>
  );
}

function CashFlowSection({ profile, corpCode, years }: { profile: ProfileId; corpCode: string; years: StockYearView[] }) {
  const yLatest = years.find((y) => y.year === LATEST_ANNUAL_YEAR)!;
  const cfGroups: SignedGroupedBarsGroup[] = years.map((y) => ({
    label: `${y.year.slice(2)}년`,
    values: [eok(y.resolutions.operating_cf), eok(y.resolutions.investing_cf), eok(y.resolutions.financing_cf)],
  }));

  return (
    <section className={styles.section}>
      <h2>④ 현금흐름</h2>
      <div className={styles.sectionTitle}>현금흐름 — 연간 3개년(FY23~25) · 억원 · 위 유입 · 아래 유출</div>
      <SignedGroupedBars groups={cfGroups} seriesLabels={["영업", "투자", "재무"]} />
      <SourceCollapse
        count={
          years.filter((y) => y.resolutions.operating_cf).length +
          years.filter((y) => y.resolutions.investing_cf).length +
          years.filter((y) => y.resolutions.financing_cf).length
        }
      >
        {years.map((y) => (
          <TraceOnly
            key={`op-${y.year}`}
            profile={profile}
            corpCode={corpCode}
            year={y.year}
            metric={{ key: "operating_cf", label: `영업활동현금흐름 ${y.year}`, sourceAvailable: true, unit: "KRW" }}
            resolution={y.resolutions.operating_cf}
          />
        ))}
        {years.map((y) => (
          <TraceOnly
            key={`inv-${y.year}`}
            profile={profile}
            corpCode={corpCode}
            year={y.year}
            metric={{ key: "investing_cf", label: `투자활동현금흐름 ${y.year}`, sourceAvailable: true, unit: "KRW" }}
            resolution={y.resolutions.investing_cf}
          />
        ))}
        {years.map((y) => (
          <TraceOnly
            key={`fin-${y.year}`}
            profile={profile}
            corpCode={corpCode}
            year={y.year}
            metric={{ key: "financing_cf", label: `재무활동현금흐름 ${y.year}`, sourceAvailable: true, unit: "KRW" }}
            resolution={y.resolutions.financing_cf}
          />
        ))}
      </SourceCollapse>
      <div className={styles.fieldList}>
        {/* v3 V5 — 라벨의 "= 영업CF − CAPEX"는 METRIC_DOCS.fcf.formula로 이관했다. */}
        <RawField corpCode={corpCode} profile={profile} year={LATEST_ANNUAL_YEAR} metricKey="fcf" label="잉여현금흐름(FCF)" unit="KRW" panelUnit="KRW" resolution={yLatest.resolutions.fcf} />
      </div>
    </section>
  );
}

function ProfitabilitySection({ profile, corpCode, years }: { profile: ProfileId; corpCode: string; years: StockYearView[] }) {
  const yLatest = years.find((y) => y.year === LATEST_ANNUAL_YEAR)!;
  const marginMetric = findProfileMetric("STANDARD", "operating_margin")!;
  // 최종 리뷰 픽스(C1): 수익성 섹션도 지배주주 귀속분을 주 지표로 병기한다 — 두 키 전부 모든
  // 프로필 카탈로그에 있어 findProfileMetric이 항상 값을 반환하지만, 방어적으로 optional 처리.
  const netIncomeAttrMetric = findProfileMetric(profile, "net_income_attributable_to_owners");
  const netIncomeTotalMetric = findProfileMetric(profile, "net_income");

  const linePoints = (key: string): LineChartPoint[] => years.map((y) => ({ label: `${y.year.slice(2)}년`, value: y.resolutions[key]?.normalized ?? null }));
  const roePoints = linePoints("roe");
  const roeOwnersPoints = linePoints("roe_owners");
  const roeOwnersOnTotalEquityPoints = linePoints("roe_owners_on_total_equity");
  const marginPoints = linePoints("operating_margin");

  return (
    <section className={styles.section}>
      <h2>⑤ 수익성</h2>

      {/* v4 — ROE는 산정기준에 따라 값이 갈린다. 어느 기준인지 라벨에 박고 셋을 나란히 놓는다.
          한 차트에 겹치지 않는 이유: LineChart는 단일 시리즈 전용이고(LineChart.tsx §다중 Line
          함정) 기준마다 산식 패널이 따로 붙어야 한다. */}
      <div className={styles.subSection}>⑤-1 ROE 산정기준 — 지배기업 소유주 귀속 기준</div>

      <div className={styles.sectionTitle}>ROE — DART 산출 · 평균 자본총계 기준 · 연간 3개년(FY23~25) · %</div>
      <LineChart points={roePoints} unit="%" sign />
      <SourceCollapse count={years.filter((y) => y.resolutions.roe).length}>
        {years.map((y) => (
          <TraceOnly key={y.year} profile={profile} corpCode={corpCode} year={y.year} metric={{ key: "roe", label: `ROE ${y.year}`, sourceAvailable: true, unit: "PCT" }} resolution={y.resolutions.roe} />
        ))}
      </SourceCollapse>

      <div className={styles.sectionTitle}>ROE — 지배기업 소유주 귀속 기준 · 연간 3개년(FY23~25) · % · 요구사항 정본</div>
      <LineChart points={roeOwnersPoints} unit="%" sign color={CATEGORY_PALETTE[2]} />
      <SourceCollapse
        count={years.filter((y) => y.resolutions.roe_owners).length}
        formulaSlot={<FormulaPanel entries={annualFormulaEntries(years, "roe_owners")} />}
      >
        {years.map((y) => (
          <TraceOnly
            key={y.year}
            profile={profile}
            corpCode={corpCode}
            year={y.year}
            metric={{ key: "roe_owners", label: `ROE(지배기업 소유주 귀속) ${y.year}`, sourceAvailable: true, unit: "PCT" }}
            resolution={y.resolutions.roe_owners}
          />
        ))}
      </SourceCollapse>

      <div className={styles.sectionTitle}>ROE — 지배기업 소유주 귀속 손익 ÷ 자본총계 · 연간 3개년(FY23~25) · % · 연구원 엑셀 방식</div>
      <LineChart points={roeOwnersOnTotalEquityPoints} unit="%" sign color={CATEGORY_PALETTE[3]} />
      <SourceCollapse
        count={years.filter((y) => y.resolutions.roe_owners_on_total_equity).length}
        formulaSlot={<FormulaPanel entries={annualFormulaEntries(years, "roe_owners_on_total_equity")} />}
      >
        {years.map((y) => (
          <TraceOnly
            key={y.year}
            profile={profile}
            corpCode={corpCode}
            year={y.year}
            metric={{ key: "roe_owners_on_total_equity", label: `ROE(귀속손익÷자본총계) ${y.year}`, sourceAvailable: true, unit: "PCT" }}
            resolution={y.resolutions.roe_owners_on_total_equity}
          />
        ))}
      </SourceCollapse>

      <div className={styles.noteText}>
        세 값은 계산 오류가 아니라 <b>산정기준 차이</b>다. DART 지표는 분자가 당기순이익 총액(비지배 포함)이고 분모가 <b>평균</b> 자본총계다. 요구사항
        기준은 분자·분모를 모두 지배기업 소유주 귀속분으로 맞춘 <b>기말</b> 기준이다. 연구원 엑셀은 분자만 귀속분이고 분모는 자본총계여서 둘의 중간에
        놓인다. 분모 시점(평균/기말) 차이가 비지배지분 포함 여부보다 크게 작용한다.
      </div>

      <div className={styles.subSection}>⑤-2 그 밖의 수익성 지표</div>

      <div className={styles.sectionTitle}>영업이익률 추이 — 연간 3개년(FY23~25) · %</div>
      <LineChart points={marginPoints} unit="%" sign color={CATEGORY_PALETTE[1]} />
      {/* v4 이전에는 연간 축에서 산식이 있는 유일한 차트였다. 지금은 ⑤-1의 ROE 파생 2종이 합류해
          셋이다. 나머지(DART 직독 ROE·부채비율·BS·연간 CF·워터폴)는 여전히 직독값이라
          FormulaPanel이 null을 반환한다 — 그쪽에 슬롯을 안 붙인 건 그래서다. */}
      <SourceCollapse count={years.filter((y) => y.resolutions.operating_margin).length} formulaSlot={<FormulaPanel entries={annualFormulaEntries(years, "operating_margin")} />}>
        {years.map((y) => (
          <TraceOnly
            key={y.year}
            profile={profile}
            corpCode={corpCode}
            year={y.year}
            metric={{ key: "operating_margin", label: `영업이익률 ${y.year}`, sourceAvailable: true, unit: "PCT" }}
            resolution={y.resolutions.operating_margin}
          />
        ))}
      </SourceCollapse>

      <div className={styles.fieldList}>
        {netIncomeAttrMetric && (
          <GatedField profile={profile} corpCode={corpCode} year={LATEST_ANNUAL_YEAR} metric={netIncomeAttrMetric} resolution={yLatest.resolutions.net_income_attributable_to_owners} />
        )}
        {netIncomeTotalMetric && <GatedField profile={profile} corpCode={corpCode} year={LATEST_ANNUAL_YEAR} metric={netIncomeTotalMetric} resolution={yLatest.resolutions.net_income} />}
        <RawField corpCode={corpCode} profile={profile} year={LATEST_ANNUAL_YEAR} metricKey="roe" label="ROE(DART 산출 · 평균 자본총계 기준)" unit="PCT" panelUnit="PCT" resolution={yLatest.resolutions.roe} />
        <RawField
          corpCode={corpCode}
          profile={profile}
          year={LATEST_ANNUAL_YEAR}
          metricKey="roe_owners"
          label="ROE(지배기업 소유주 귀속 기준)"
          unit="PCT"
          panelUnit="PCT"
          resolution={yLatest.resolutions.roe_owners}
        />
        <RawField
          corpCode={corpCode}
          profile={profile}
          year={LATEST_ANNUAL_YEAR}
          metricKey="roe_owners_on_total_equity"
          label="ROE(귀속 손익 ÷ 자본총계)"
          unit="PCT"
          panelUnit="PCT"
          resolution={yLatest.resolutions.roe_owners_on_total_equity}
        />
        <RawField
          corpCode={corpCode}
          profile={profile}
          year={LATEST_ANNUAL_YEAR}
          metricKey="roa"
          // v3 V5 — 라벨에 박아 뒀던 계산식은 METRIC_DOCS.roa.formula로 이관했다(FieldRow가 값 아래 렌더).
          label="ROA(총자산이익률, 총액 기준)"
          unit="PCT"
          panelUnit="PCT"
          resolution={yLatest.resolutions.roa}
        />
        <GatedField profile={profile} corpCode={corpCode} year={LATEST_ANNUAL_YEAR} metric={marginMetric} resolution={yLatest.resolutions.operating_margin} />
      </div>
    </section>
  );
}

function StabilitySection({ profile, corpCode, years }: { profile: ProfileId; corpCode: string; years: StockYearView[] }) {
  const yLatest = years.find((y) => y.year === LATEST_ANNUAL_YEAR)!;
  // v2 T5 — 부채비율은 PROFILE_CATALOG[profile].stability에 등록된 프로필(STANDARD)에서만 차트를
  // 그린다(카탈로그 기반 — 금융 프로필은 stability에 debt_ratio 자체가 없어 findProfileMetric이
  // undefined를 반환하고 차트가 자연히 생략된다. 지표 키를 프로필별로 하드코딩하지 않는다).
  const debtRatioMetric = findProfileMetric(profile, "debt_ratio");
  const debtRatioPoints: LineChartPoint[] = years.map((y) => ({ label: `${y.year.slice(2)}년`, value: y.resolutions.debt_ratio?.normalized ?? null }));

  return (
    <section className={styles.section}>
      <h2>⑥ 안정성</h2>
      {debtRatioMetric && (
        <>
          <div className={styles.sectionTitle}>부채비율 추이 — 연간 3개년(FY23~25) · % · 100% 기준선</div>
          <LineChart points={debtRatioPoints} unit="%" baseline={{ value: 100, label: "100% 기준선(부채가 자본을 초과)" }} />
          <SourceCollapse count={years.filter((y) => y.resolutions.debt_ratio).length}>
            {years.map((y) => (
              <TraceOnly
                key={y.year}
                profile={profile}
                corpCode={corpCode}
                year={y.year}
                metric={{ key: "debt_ratio", label: `${debtRatioMetric.label} ${y.year}`, sourceAvailable: true, unit: "PCT" }}
                resolution={y.resolutions.debt_ratio}
              />
            ))}
          </SourceCollapse>
        </>
      )}
      <div className={styles.fieldList}>
        {PROFILE_CATALOG[profile].stability.map((metric) => (
          <GatedField key={metric.key} profile={profile} corpCode={corpCode} year={LATEST_ANNUAL_YEAR} metric={metric} resolution={yLatest.resolutions[metric.key]} />
        ))}
      </div>
    </section>
  );
}

function ShareholderReturnSection({ profile, corpCode, years }: { profile: ProfileId; corpCode: string; years: StockYearView[] }) {
  const yLatest = years.find((y) => y.year === LATEST_ANNUAL_YEAR)!;
  const r = yLatest.resolutions;
  const payoutConflictNote = dividendPayoutConflictNote(r.dividend_payout_indx, r.dividend_payout_fallback);

  // v2 T5 — OverlaidBars(outer=EPS, inner=DPS). 승인 규칙 4: 무배당(ZERO_BY_FACT)과 데이터 없음
  // (MISSING)을 구분한다 — dps_common의 displayState를 그대로 innerState에 반영한다.
  const returnBars: OverlaidBar[] = years.map((y) => {
    const eps = y.resolutions.eps_basic;
    const dps = y.resolutions.dps_common;
    const zeroByFact = dps?.displayState === "ZERO_BY_FACT";
    return {
      label: `${y.year.slice(2)}년`,
      outer: eps?.normalized ?? null,
      inner: zeroByFact ? 0 : (dps?.normalized ?? null),
      innerState: zeroByFact ? "ZERO_BY_FACT" : undefined,
    };
  });

  return (
    <section className={styles.section}>
      <h2>⑦ 주주환원</h2>
      <div className={styles.sectionTitle}>EPS·DPS 추이 — 연간 3개년(FY23~25) · 원 · 진한 안쪽 막대 = DPS</div>
      <OverlaidBars bars={returnBars} outerLabel="EPS(기본주당이익)" innerLabel="DPS(주당현금배당금)" />
      <SourceCollapse
        count={years.filter((y) => y.resolutions.eps_basic).length + years.filter((y) => y.resolutions.dps_common).length}
      >
        {years.map((y) => (
          <TraceOnly key={`eps-${y.year}`} profile={profile} corpCode={corpCode} year={y.year} metric={{ key: "eps_basic", label: `EPS ${y.year}`, sourceAvailable: true, unit: "KRW" }} resolution={y.resolutions.eps_basic} />
        ))}
        {years.map((y) => (
          <TraceOnly key={`dps-${y.year}`} profile={profile} corpCode={corpCode} year={y.year} metric={{ key: "dps_common", label: `DPS ${y.year}`, sourceAvailable: true, unit: "KRW" }} resolution={y.resolutions.dps_common} />
        ))}
      </SourceCollapse>
      <div className={styles.fieldList}>
        <RawField corpCode={corpCode} profile={profile} year={LATEST_ANNUAL_YEAR} metricKey="eps_basic" label="기본주당이익(EPS, 재무제표)" unit="WON" panelUnit="KRW" resolution={r.eps_basic} />
        <RawField corpCode={corpCode} profile={profile} year={LATEST_ANNUAL_YEAR} metricKey="eps_alotmatter" label="주당순이익(배당공시)" unit="WON" panelUnit="KRW" resolution={r.eps_alotmatter} />
        <RawField
          corpCode={corpCode}
          profile={profile}
          year={LATEST_ANNUAL_YEAR}
          metricKey="dps_common"
          label="주당현금배당금(DPS, 보통주)"
          unit="WON"
          panelUnit="KRW"
          resolution={r.dps_common}
          zeroByFactNote="무배당 확인"
        />
        <RawField
          corpCode={corpCode}
          profile={profile}
          year={LATEST_ANNUAL_YEAR}
          metricKey="dividend_yield_common"
          label="현금배당수익률(보통주)"
          unit="PCT"
          panelUnit="PCT"
          resolution={r.dividend_yield_common}
          zeroByFactNote="무배당 확인"
        />
        <RawField
          corpCode={corpCode}
          profile={profile}
          year={LATEST_ANNUAL_YEAR}
          metricKey="dividend_payout_indx"
          label="배당성향(DART 산출지표)"
          unit="PCT"
          panelUnit="PCT"
          resolution={r.dividend_payout_indx}
          zeroByFactNote="무배당 확인"
          conflictNote={payoutConflictNote}
        />
        <RawField
          corpCode={corpCode}
          profile={profile}
          year={LATEST_ANNUAL_YEAR}
          metricKey="dividend_payout_fallback"
          // v3 V5 — 라벨의 "배당총액÷순이익"은 METRIC_DOCS.dividend_payout_fallback.formula로 이관.
          label="배당성향(fallback)"
          unit="PCT"
          panelUnit="PCT"
          resolution={r.dividend_payout_fallback}
          zeroByFactNote="무배당 확인"
          conflictNote={payoutConflictNote}
        />
        <RawField corpCode={corpCode} profile={profile} year={LATEST_ANNUAL_YEAR} metricKey="shares_outstanding" label="발행주식총수" unit="SHARES" panelUnit="X" resolution={r.shares_outstanding} />
        <RawField corpCode={corpCode} profile={profile} year={LATEST_ANNUAL_YEAR} metricKey="treasury_shares" label="자기주식수" unit="SHARES" panelUnit="X" resolution={r.treasury_shares} />
      </div>
    </section>
  );
}

function ValuationStrip() {
  return (
    <section className={styles.valuationStrip}>
      <div className={styles.field}>
        <div className={styles.fieldLabel}>PER</div>
        <MetricValue state="SOURCE_NOT_AVAILABLE" unit="X" note="주가 미연동" />
      </div>
      <div className={styles.field}>
        <div className={styles.fieldLabel}>PBR</div>
        <MetricValue state="SOURCE_NOT_AVAILABLE" unit="X" note="주가 미연동" />
      </div>
      <p className={styles.valuationHint}>DART 재무 API는 시세를 제공하지 않는다 — 시세 연동은 이 프로토타입 범위 밖이다(정직하게 미확보로 표기). 적자 기업 PER도 같은 이유로 N/A다.</p>
    </section>
  );
}

export default async function StockDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const row = UNIVERSE.find((r) => r.stockCode === code);
  if (!row) notFound();

  const profile = profileIdOf(row);
  const years = ALL_ANNUAL_YEARS.map((year) => loadStockYearView(row, year));
  const yLatest = years.find((y) => y.year === LATEST_ANNUAL_YEAR)!;
  const quarters = loadStockQuartersWithFinExtras(row);
  const coverage = summarizeCoverage(profile, yLatest.resolutions);
  const coveragePct = Math.round((coverage.hit / coverage.total) * 100);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link href="/" className={styles.backLink}>
          ← 종목 목록
        </Link>
        <div className={styles.headTop}>
          <h1>
            {row.name} <span className="mono">({row.stockCode})</span>
          </h1>
          <span className={`${styles.badge} ${profile === "STANDARD" ? styles.badgeStandard : styles.badgeFin}`}>{PROFILE_LABEL[profile]}</span>
          {row.accMt !== "12" && <span className={styles.fyBadge}>결산월 {row.accMt}월(비12월)</span>}
        </div>
        <p className={styles.headMeta}>
          {row.market === "Y" ? "코스피" : row.market === "K" ? "코스닥" : row.market} · 기준연도 {LATEST_ANNUAL_YEAR} · 최신 분기 {LATEST_QUARTER_HEADER_LABEL}(잠정) · 기준{" "}
          {basisLabel(yLatest.fsDiv)}
          {yLatest.fsDivFallbackApplied && " (CFS 미작성 → OFS 폴백)"} · 커버리지 {coveragePct}% ({coverage.hit}/{coverage.total})
        </p>
      </header>

      <ValuationStrip />

      <OverviewSection row={row} profile={profile} />
      <PnlSection profile={profile} corpCode={row.corpCode} years={years} quarters={quarters} accMt={row.accMt} />
      <BalanceSection profile={profile} corpCode={row.corpCode} years={years} quarters={quarters} accMt={row.accMt} />
      <CashFlowSection profile={profile} corpCode={row.corpCode} years={years} />
      <ProfitabilitySection profile={profile} corpCode={row.corpCode} years={years} />
      <StabilitySection profile={profile} corpCode={row.corpCode} years={years} />
      <ShareholderReturnSection profile={profile} corpCode={row.corpCode} years={years} />
    </main>
  );
}
