import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import CashFlowDiverging from "@/components/charts/CashFlowDiverging";
import LineChart from "@/components/charts/LineChart";
import type { LineChartPoint } from "@/components/charts/LineChart";
import PnlWaterfall from "@/components/charts/PnlWaterfall";
import QuarterBars from "@/components/charts/QuarterBars";
import StackedBar100 from "@/components/charts/StackedBar100";
import StackedBars from "@/components/charts/StackedBars";
import ZeroAxisBars from "@/components/charts/ZeroAxisBars";
import MetricValue from "@/components/MetricValue";
import type { MetricValueProps } from "@/components/MetricValue";
import SourcePanel from "@/components/SourcePanel";
import { formatEstDt, loadCompany } from "@/lib/company";
import type { DerivedQuarterSeries } from "@/lib/derived";
import { toEok } from "@/lib/format";
import type { DisplayState, ProfileId, Resolution } from "@/lib/normalize/types";
import {
  catalogKeysOnlyIn,
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
import { availableYears, loadQuarterSeries, loadStockYearView, profileIdOf, UNIVERSE } from "@/lib/stockView";
import type { StockYearView, UniverseRow } from "@/lib/stockView";

import styles from "./page.module.css";

/**
 * 종목 상세(/stock/[code]) — **재무 7셋**을 한 화면에 세로로 쌓는다.
 *
 * 7셋은 클라이언트가 확정한 항목 구성이다(분석보고서/이띠_데이터항목_학습가이드.html):
 *   ① 손익 ② 재무상태 ③ 현금흐름 ④ 수익성 ⑤ 안정성 ⑥ 주주환원 ⑦ 밸류에이션
 *
 * 20종목 전부 이 파일 하나로 렌더된다 — 종목별 분기 없이 lib/profiles.ts의 PROFILE_CATALOG를
 * 순회해서 표준/금융 화면 차이를 만들어 낸다.
 *
 * **차트 문법**(클라이언트 합의, 202608-mockup-refit.md §슬랙 반영사항 ①):
 *   금액 추이 = 막대 · 성장률/비율 추이 = 꺾은선 · 재무상태 = 누적 막대 · 현금흐름 = 상하(±) 막대
 *
 * **연도 축**: `?year=`로 전환한다. 선택 가능한 연도는 derived.json이 실제로 담은 목록
 * (availableYears())이라 수집 범위를 늘리면 탭이 자동으로 늘어난다. 분기 시계열(QoQ)은 연도
 * 축과 별개라 연도 선택과 무관하게 전 구간을 보여준다.
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

/** 상태별 공통 보충 설명 — 종목·지표에 무관하게 항상 같은 문구를 쓴다(하드코딩 아님, 상태 기반). */
function defaultNoteFor(state: DisplayState, profile: ProfileId): string | undefined {
  switch (state) {
    case "NOT_IN_PROFILE":
      return `${PROFILE_LABEL[profile]} 프로필 해당 없음`;
    case "SOURCE_NOT_AVAILABLE":
      return "DART 미제공";
    case "NA_NEGATIVE_BASE":
      return "분모 음수";
    default:
      return undefined;
  }
}

/**
 * 화면 모드 — 같은 데이터를 두 관점으로 보여준다.
 *
 * - `data`  **클라이언트 제공 화면(기본).** 수치와 차트, 그리고 값이 없을 때의 사유 배지만
 *           남긴다. 어떤 API의 어떤 계정에서 왔는지 같은 내부 추적 정보는 숨긴다.
 * - `trace` **원천 추적 화면.** 위에 더해 지표마다 출처 collapse(요청 URL·원본 JSON·폴백
 *           이력·정규화·파생 계산식)와 커버리지·실증 노트를 전부 노출한다. 우리가 데이터를
 *           제대로 읽고 있는지 검증하는 용도라 클라이언트 시연 화면에는 넣지 않는다.
 *
 * 결측 사유 배지(`데이터 없음`/`해당 없음`/`원천 미확보`/`무배당 확인`)는 **두 모드 모두에
 * 남긴다** — 이건 디버깅 정보가 아니라 "근거 없는 숫자를 만들지 않는다"는 약속의 표현이라,
 * 클라이언트에게야말로 보여야 하는 것이다.
 */
export type ViewMode = "data" | "trace";

type FieldContext = {
  corpCode: string;
  profile: ProfileId;
  /** SourcePanel requestId 조립에 쓰이는 조회 연도 — 연도 탭에 따라 바뀐다. */
  year: string;
  view: ViewMode;
};

/** 출처 collapse·커버리지·실증 노트처럼 추적 모드에서만 보이는 요소인지. */
function isTrace(ctx: FieldContext): boolean {
  return ctx.view === "trace";
}

function FieldRow({
  ctx,
  label,
  state,
  value,
  unit,
  panelUnit,
  note,
  basis,
  metricKey,
  resolution,
}: {
  ctx: FieldContext;
  label: string;
  state: DisplayState;
  value?: number;
  unit: NonNullable<MetricValueProps["unit"]>;
  panelUnit: "KRW" | "PCT" | "X";
  note?: string;
  basis?: "연결" | "별도";
  metricKey: string;
  resolution?: Resolution;
}) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldLabel}>{label}</div>
      <MetricValue state={state} value={value} unit={unit} basis={basis} note={note} />
      {resolution && isTrace(ctx) && <SourcePanel {...buildSourcePanelProps(metricKey, ctx.corpCode, ctx.year, withDisplayState(resolution, state), panelUnit, ctx.profile)} />}
    </div>
  );
}

/** 프로필 카탈로그(pnl/stability/balance)에 등록된 지표 — NOT_IN_PROFILE/SOURCE_NOT_AVAILABLE 판정을 거친다. */
function GatedField({ ctx, metric, resolution }: { ctx: FieldContext; metric: ProfileMetric; resolution?: Resolution }) {
  const state = resolveDisplay(ctx.profile, metric.key, resolution);
  const value = state === "OK" && resolution?.normalized != null ? toDisplayValue(resolution.normalized, metric.unit) : undefined;
  return (
    <FieldRow
      ctx={ctx}
      label={metric.label}
      state={state}
      value={value}
      unit={metric.unit}
      panelUnit={metric.unit}
      note={defaultNoteFor(state, ctx.profile)}
      basis={resolution ? basisLabel(resolution.fsDiv) : undefined}
      metricKey={metric.key}
      resolution={resolution}
    />
  );
}

/** 카탈로그에 없는 보편 지표(ROE·ROA·EPS·BPS·DPS·자산총계 등) — 모든 프로필에 동일 개념으로 존재해 프로필 게이팅을 거치지 않는다. */
function RawField({
  ctx,
  metricKey,
  label,
  unit,
  panelUnit,
  resolution,
  zeroByFactNote,
  conflictNote,
}: {
  ctx: FieldContext;
  metricKey: string;
  label: string;
  unit: NonNullable<MetricValueProps["unit"]>;
  panelUnit: "KRW" | "PCT" | "X";
  resolution?: Resolution;
  /** ZERO_BY_FACT일 때 보여줄 문구 — 배당 계열 지표에서 "무배당 확인"으로 쓰인다. */
  zeroByFactNote?: string;
  /** 리뷰 픽스(I2) — 상태와 무관하게 최우선으로 노출되는 주석(두 배당성향 값의 산출 기준이 달라 상충할 때). */
  conflictNote?: string;
}) {
  const state = resolution?.displayState ?? "MISSING";
  const value = state === "OK" && resolution?.normalized != null ? toDisplayValue(resolution.normalized, unit) : undefined;
  const note = conflictNote ?? (state === "ZERO_BY_FACT" ? zeroByFactNote : state === "NA_NEGATIVE_BASE" ? "분모 음수" : undefined);
  return (
    <FieldRow
      ctx={ctx}
      label={label}
      state={state}
      value={value}
      unit={unit}
      panelUnit={panelUnit}
      note={note}
      basis={resolution ? basisLabel(resolution.fsDiv) : undefined}
      metricKey={metricKey}
      resolution={resolution}
    />
  );
}

/** 차트가 이미 값을 그린 지표용 — 중복 숫자 표기 없이 출처 collapse만 붙인다. */
function TraceOnly({ ctx, metric, resolution }: { ctx: FieldContext; metric: ProfileMetric; resolution?: Resolution }) {
  // 차트가 이미 값을 그린 지표라 이 블록에는 출처 collapse밖에 없다 — 데이터 모드에선 통째로 뺀다.
  if (!resolution || !isTrace(ctx)) return null;
  const state = resolveDisplay(ctx.profile, metric.key, resolution);
  return (
    <div className={styles.field}>
      <div className={styles.fieldLabel}>{metric.label}</div>
      <SourcePanel {...buildSourcePanelProps(metric.key, ctx.corpCode, ctx.year, withDisplayState(resolution, state), metric.unit, ctx.profile)} />
    </div>
  );
}

/** "이 프로필에는 아예 없는 항목"을 빈칸이 아니라 `해당 없음` 배지로 보여주는 블록. */
function NotInProfileBlock({ ctx, title, keys, sourceProfile }: { ctx: FieldContext; title: string; keys: string[]; sourceProfile: ProfileId }) {
  if (keys.length === 0) return null;
  return (
    <div className={styles.naBlock}>
      <div className={styles.sectionTitle}>{title}</div>
      <div className={styles.fieldList}>
        {keys.map((key) => {
          const metric = findProfileMetric(sourceProfile, key);
          if (!metric) return null;
          return <GatedField key={key} ctx={ctx} metric={metric} />;
        })}
      </div>
    </div>
  );
}

function eok(resolution: Resolution | undefined): number | null {
  return resolution?.normalized != null ? toEok(resolution.normalized) : null;
}

/** 비율/성장률 Resolution 배열 → 꺾은선 포인트. NA_NEGATIVE_BASE는 "흑자전환" 같은 사유 문구로 대체한다. */
function toLinePoints(entries: { label: string; resolution: Resolution | undefined }[]): LineChartPoint[] {
  return entries.map(({ label, resolution }) => {
    if (resolution?.displayState === "OK" && resolution.normalized != null) {
      return { label, value: Math.round(resolution.normalized * 10) / 10 };
    }
    // 부호가 뒤집힌 구간(적자→흑자)은 %가 무의미하다 — 숫자 대신 전환 사유를 찍는다.
    const derivation = resolution?.derivation ?? "";
    const placeholder = derivation.includes("흑자전환") ? "흑자전환" : derivation.includes("적자전환") ? "적자전환" : undefined;
    return { label, value: null, placeholder };
  });
}

/**
 * 리뷰 픽스(I2) — 배당성향 두 원천(dividend_payout_indx: DART 자체 산출 M451000 vs
 * dividend_payout_fallback: 배당총액÷지배주주 귀속 순이익)의 부호가 다르거나 10%p 이상
 * 벌어지면 두 값 모두 "산출 기준이 다르다"는 배지를 붙인다.
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
/* 섹션                                                                       */
/* ------------------------------------------------------------------------ */

function OverviewSection({ ctx, row }: { ctx: FieldContext; row: UniverseRow }) {
  const envelope = loadCompany(row.stockCode);
  const company = envelope.body;
  const profile = ctx.profile;
  return (
    <section className={styles.section}>
      <h2>개요</h2>
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
          {PROFILE_LABEL[profile]}
          {isTrace(ctx) && ` (${row.profileSource === "MANUAL" ? "수동 확정" : "자동(KSIC)"})`}
        </dd>
      </dl>
      {isTrace(ctx) && (
        <>
          <p className={styles.noteText}>T2 실증 포인트: {row.note}</p>
          <details className={styles.rawDetails}>
            <summary>원본 company.json</summary>
            <pre className={styles.pre}>{JSON.stringify(company, null, 2)}</pre>
          </details>
        </>
      )}
    </section>
  );
}

/* ── ① 손익 ─────────────────────────────────────────────────────────────── */

function PnlSection({
  ctx,
  years,
  current,
  quarterSeries,
}: {
  ctx: FieldContext;
  years: StockYearView[];
  current: StockYearView;
  quarterSeries: Record<string, DerivedQuarterSeries["points"]>;
}) {
  const { profile } = ctx;
  const coverage = summarizePnlCoverage(profile, current.resolutions);

  const revenueQ = quarterSeries.revenue ?? [];
  const operatingQ = quarterSeries.operating_income ?? [];
  const hasQuarterly = revenueQ.some((p) => p.resolution.displayState === "OK") || operatingQ.some((p) => p.resolution.displayState === "OK");

  const growthBlock = hasQuarterly && (
    <>
      <div className={styles.sectionTitle}>
        분기 매출액 — 단일분기(4분기는 연간−3Q누적 역산) · 억원
        <span className={styles.axisNote}>연도 탭과 무관하게 전 구간 표시</span>
      </div>
      <QuarterBars bars={revenueQ.map((p) => ({ label: p.label, value: eok(p.resolution), provisional: p.provisional }))} unit="억원" />

      <div className={styles.sectionTitle}>매출액 성장률 — QoQ(전분기 대비) · %</div>
      <LineChart points={toLinePoints(revenueQ.map((p) => ({ label: p.label, resolution: p.qoq })))} unit="%" color="var(--chart-4)" />

      <div className={styles.sectionTitle}>매출액 성장률 — YoY(전년 동기 대비, 계절성 제거) · %</div>
      <LineChart points={toLinePoints(revenueQ.map((p) => ({ label: p.label, resolution: p.yoy })))} unit="%" color="var(--green)" />

      <div className={styles.sectionTitle}>분기 영업이익 — 단일분기 · 억원</div>
      <QuarterBars bars={operatingQ.map((p) => ({ label: p.label, value: eok(p.resolution), provisional: p.provisional }))} unit="억원" />

      <div className={styles.sectionTitle}>영업이익 성장률 — QoQ · %</div>
      <LineChart points={toLinePoints(operatingQ.map((p) => ({ label: p.label, resolution: p.qoq })))} unit="%" color="var(--chart-4)" />
    </>
  );

  const annualGrowth = (
    <>
      <div className={styles.sectionTitle}>연간 성장률(YoY) — 자체 계산 · %</div>
      <LineChart
        points={toLinePoints(years.map((y) => ({ label: `${y.year}`, resolution: y.resolutions.revenue_growth_yoy })))}
        unit="%"
        color="var(--green)"
      />
      <div className={styles.fieldList}>
        <RawField ctx={ctx} metricKey="revenue_growth_yoy_indx" label="매출액증가율(YoY, DART 산출지표)" unit="PCT" panelUnit="PCT" resolution={current.resolutions.revenue_growth_yoy_indx} />
        <RawField
          ctx={ctx}
          metricKey="operating_income_growth_yoy_indx"
          label="영업이익증가율(YoY, DART 산출지표)"
          unit="PCT"
          panelUnit="PCT"
          resolution={current.resolutions.operating_income_growth_yoy_indx}
        />
        <RawField
          ctx={ctx}
          metricKey="net_income_growth_yoy_indx"
          label="순이익증가율(YoY, DART 산출지표)"
          unit="PCT"
          panelUnit="PCT"
          resolution={current.resolutions.net_income_growth_yoy_indx}
        />
      </div>
    </>
  );

  if (profile === "STANDARD") {
    const waterfallMetrics = PROFILE_CATALOG.STANDARD.pnl.filter((m) => m.chart === "waterfall");
    const waterfallRows = waterfallMetrics.map((metric) => {
      const resolution = current.resolutions[metric.key];
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

    const netIncomeBars = years.map((y) => ({ label: `${y.year.slice(2)}년`, value: eok(y.resolutions.net_income_attributable_to_owners) }));

    return (
      <section className={styles.section}>
        <h2>① 손익 — &ldquo;얼마 벌어서 얼마 남겼나&rdquo;</h2>
        <div className={styles.sectionTitle}>
          손익 깔때기 — {ctx.year} · {basisLabel(current.fsDiv)} · 억원
        </div>
        <PnlWaterfall rows={chartRows} />
        <div className={styles.fieldList}>
          {waterfallRows.map(({ metric, resolution }) => (
            <TraceOnly key={metric.key} ctx={ctx} metric={metric} resolution={resolution} />
          ))}
        </div>

        <div className={styles.sectionTitle}>단계별 이익률 — 매출 100원당 각 단계에 남는 금액 · %</div>
        <div className={styles.fieldList}>
          <RawField ctx={ctx} metricKey="gross_margin" label="매출총이익률" unit="PCT" panelUnit="PCT" resolution={current.resolutions.gross_margin} />
          <GatedField ctx={ctx} metric={findProfileMetric("STANDARD", "operating_margin")!} resolution={current.resolutions.operating_margin} />
          <RawField ctx={ctx} metricKey="net_margin" label="순이익률" unit="PCT" panelUnit="PCT" resolution={current.resolutions.net_margin} />
        </div>

        <div className={styles.sectionTitle}>당기순이익(지배주주) 추이 — 0 기준 발산 막대(적자 구간 자동 표현) · 억원</div>
        <ZeroAxisBars bars={netIncomeBars} />

        {growthBlock}
        {annualGrowth}

        {isTrace(ctx) && (
          <div className={styles.coverageBox}>
            손익 후보 {coverage.total}개 중 {coverage.hit}개 존재
            {coverage.missing.length > 0 && <span className={styles.coverageMissing}> · 미존재: {coverage.missing.map((m) => `${m.label}(${m.state})`).join(", ")}</span>}
          </div>
        )}
      </section>
    );
  }

  // 금융 프로필 — 매출→매출총이익→영업이익 깔때기가 성립하지 않아 워터폴 대신 구성 스택으로 본다.
  const stackedMetrics = PROFILE_CATALOG[profile].pnl.filter((m) => m.chart === "stacked");
  const deductionMetrics = PROFILE_CATALOG[profile].pnl.filter((m) => m.chart === "deduction");
  const referenceMetrics = PROFILE_CATALOG[profile].pnl.filter((m) => m.chart === "none");
  const naKeys = pnlKeysOnlyIn("STANDARD", profile);

  const segments: { label: string; value: number | null }[] = [];
  const negativeSegments: { metric: ProfileMetric; resolution: Resolution }[] = [];
  for (const metric of stackedMetrics) {
    const resolution = current.resolutions[metric.key];
    const state = resolveDisplay(profile, metric.key, resolution);
    if (state === "OK" && resolution?.normalized != null && resolution.normalized > 0) {
      segments.push({ label: metric.label, value: toEok(resolution.normalized) });
    } else if (state === "OK" && resolution?.normalized != null && resolution.normalized <= 0) {
      negativeSegments.push({ metric, resolution });
    } else {
      segments.push({ label: metric.label, value: null });
    }
  }

  return (
    <section className={styles.section}>
      <h2>① 손익 — &ldquo;얼마 벌어서 얼마 남겼나&rdquo;</h2>
      <div className={styles.sectionTitle}>
        손익 구성 — {ctx.year} · {basisLabel(current.fsDiv)} · 억원 (워터폴 없음 — 금융 프로필은 표준 손익계정 체계를 따르지 않는다)
      </div>
      <StackedBar100 segments={segments} />
      <div className={styles.fieldList}>
        {stackedMetrics.map((metric) => (
          <TraceOnly key={metric.key} ctx={ctx} metric={metric} resolution={current.resolutions[metric.key]} />
        ))}
      </div>

      {deductionMetrics.length > 0 && (
        <div className={styles.deductionBlock}>
          <div className={styles.sectionTitle}>차감 항목 (스택 아님 — 순영업수익에서 차감되는 비용성 항목)</div>
          <div className={styles.fieldList}>
            {deductionMetrics.map((metric) => (
              <GatedField key={metric.key} ctx={ctx} metric={metric} resolution={current.resolutions[metric.key]} />
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
          <GatedField key={metric.key} ctx={ctx} metric={metric} resolution={current.resolutions[metric.key]} />
        ))}
      </div>

      <div className={styles.sectionTitle}>당기순이익(지배주주) 추이 — 억원</div>
      <ZeroAxisBars bars={years.map((y) => ({ label: `${y.year.slice(2)}년`, value: eok(y.resolutions.net_income_attributable_to_owners) }))} />

      {growthBlock}

      <NotInProfileBlock ctx={ctx} title="표준 프로필 전용 지표 (해당 없음)" keys={naKeys} sourceProfile="STANDARD" />

      {isTrace(ctx) && (
        <div className={styles.coverageBox}>
          손익 후보 {coverage.total}개 중 {coverage.hit}개 존재
          {coverage.missing.length > 0 && <span className={styles.coverageMissing}> · 미존재: {coverage.missing.map((m) => `${m.label}(${m.state})`).join(", ")}</span>}
        </div>
      )}
    </section>
  );
}

/* ── ② 재무상태 ─────────────────────────────────────────────────────────── */

function BalanceSection({ ctx, years, current }: { ctx: FieldContext; years: StockYearView[]; current: StockYearView }) {
  const { profile } = ctx;
  const balanceMetrics = PROFILE_CATALOG[profile].balance;
  const naKeys = catalogKeysOnlyIn("balance", "STANDARD", profile);

  return (
    <section className={styles.section}>
      <h2>② 재무상태 — &ldquo;가진 것과 빚&rdquo;</h2>
      <div className={styles.sectionTitle}>
        자산 = 부채 + 자본 — 연도별 누적 막대 · {basisLabel(current.fsDiv)} · 억원
        <span className={styles.axisNote}>막대 전체 높이가 자산총계 (회계등식이라 항상 정확히 맞는다)</span>
      </div>
      <StackedBars
        periods={years.map((y) => ({
          label: `${y.year}`,
          equity: eok(y.resolutions.total_equity),
          liabilities: eok(y.resolutions.total_liabilities),
        }))}
        unit="억원"
      />
      <div className={styles.fieldList}>
        <RawField ctx={ctx} metricKey="total_assets" label="자산총계" unit="KRW" panelUnit="KRW" resolution={current.resolutions.total_assets} />
        <RawField ctx={ctx} metricKey="total_liabilities" label="부채총계" unit="KRW" panelUnit="KRW" resolution={current.resolutions.total_liabilities} />
        <RawField ctx={ctx} metricKey="total_equity" label="자본총계" unit="KRW" panelUnit="KRW" resolution={current.resolutions.total_equity} />
        <RawField ctx={ctx} metricKey="equity_attributable_to_owners" label="지배주주지분" unit="KRW" panelUnit="KRW" resolution={current.resolutions.equity_attributable_to_owners} />
      </div>

      {balanceMetrics.length > 0 && (
        <>
          <div className={styles.sectionTitle}>유동 · 비유동 구분 — 1년 안에 현금화/상환되는지 여부</div>
          <div className={styles.fieldList}>
            {balanceMetrics.map((metric) => (
              <GatedField key={metric.key} ctx={ctx} metric={metric} resolution={current.resolutions[metric.key]} />
            ))}
          </div>
        </>
      )}

      <NotInProfileBlock ctx={ctx} title="유동 · 비유동 구분 (해당 없음 — 금융기관은 유동성 순서로 배열)" keys={naKeys} sourceProfile="STANDARD" />
    </section>
  );
}

/* ── ③ 현금흐름 ─────────────────────────────────────────────────────────── */

function CashFlowSection({ ctx, current }: { ctx: FieldContext; current: StockYearView }) {
  const rows = [
    { label: "영업", value: eok(current.resolutions.operating_cf) },
    { label: "투자", value: eok(current.resolutions.investing_cf) },
    { label: "재무", value: eok(current.resolutions.financing_cf) },
  ];
  return (
    <section className={styles.section}>
      <h2>③ 현금흐름 — &ldquo;장부 말고 진짜 현금이 도는가&rdquo;</h2>
      <div className={styles.sectionTitle}>
        현금흐름 — {ctx.year} · {basisLabel(current.fsDiv)} · 억원
        <span className={styles.axisNote}>건강한 모양 = 영업(+) / 투자(−) / 재무(−) — 벌어서, 투자하고, 빚 갚는다</span>
      </div>
      <CashFlowDiverging rows={rows} />
      <div className={styles.fieldList}>
        <TraceOnly ctx={ctx} metric={{ key: "operating_cf", label: "영업활동현금흐름", sourceAvailable: true, unit: "KRW" }} resolution={current.resolutions.operating_cf} />
        <TraceOnly ctx={ctx} metric={{ key: "investing_cf", label: "투자활동현금흐름", sourceAvailable: true, unit: "KRW" }} resolution={current.resolutions.investing_cf} />
        <TraceOnly ctx={ctx} metric={{ key: "financing_cf", label: "재무활동현금흐름", sourceAvailable: true, unit: "KRW" }} resolution={current.resolutions.financing_cf} />
        <RawField ctx={ctx} metricKey="capex" label="설비투자(CAPEX, 유형자산 취득)" unit="KRW" panelUnit="KRW" resolution={current.resolutions.capex} />
        <RawField ctx={ctx} metricKey="fcf" label="잉여현금흐름(FCF = 영업CF − CAPEX)" unit="KRW" panelUnit="KRW" resolution={current.resolutions.fcf} />
      </div>
    </section>
  );
}

/* ── ④ 수익성 ───────────────────────────────────────────────────────────── */

function ProfitabilitySection({ ctx, years, current }: { ctx: FieldContext; years: StockYearView[]; current: StockYearView }) {
  const marginMetric = findProfileMetric("STANDARD", "operating_margin")!;
  return (
    <section className={styles.section}>
      <h2>④ 수익성 — &ldquo;밑천 대비 잘 벌었나&rdquo;</h2>
      <div className={styles.sectionTitle}>
        ROE 추이 — 주주 돈 100원으로 몇 원을 벌어줬나 · %
        <span className={styles.axisNote}>비교 기준: 은행 예금 금리 약 3%</span>
      </div>
      <LineChart points={toLinePoints(years.map((y) => ({ label: y.year, resolution: y.resolutions.roe })))} unit="%" color="var(--green)" />

      <div className={styles.sectionTitle}>영업이익률 추이 — %</div>
      <LineChart points={toLinePoints(years.map((y) => ({ label: y.year, resolution: y.resolutions.operating_margin })))} unit="%" color="var(--chart-3)" />

      <div className={styles.fieldList}>
        <RawField ctx={ctx} metricKey="roe" label="ROE(자기자본이익률, DART 산출)" unit="PCT" panelUnit="PCT" resolution={current.resolutions.roe} />
        <RawField
          ctx={ctx}
          metricKey="roa"
          label="ROA(총자산이익률(총액 기준), 계산: 당기순이익(총액)÷자산총계)"
          unit="PCT"
          panelUnit="PCT"
          resolution={current.resolutions.roa}
        />
        <GatedField ctx={ctx} metric={marginMetric} resolution={current.resolutions.operating_margin} />
        <RawField ctx={ctx} metricKey="net_margin" label="순이익률" unit="PCT" panelUnit="PCT" resolution={current.resolutions.net_margin} />
      </div>
    </section>
  );
}

/* ── ⑤ 안정성 ───────────────────────────────────────────────────────────── */

function StabilitySection({ ctx, years, current }: { ctx: FieldContext; years: StockYearView[]; current: StockYearView }) {
  const { profile } = ctx;
  const naKeys = catalogKeysOnlyIn("stability", "STANDARD", profile);
  const showDebtTrend = PROFILE_CATALOG[profile].stability.some((m) => m.key === "debt_ratio");
  const showCoverageTrend = PROFILE_CATALOG[profile].stability.some((m) => m.key === "interest_coverage");

  return (
    <section className={styles.section}>
      <h2>⑤ 안정성 — &ldquo;망하지 않을 회사인가&rdquo;</h2>

      {showDebtTrend && (
        <>
          <div className={styles.sectionTitle}>부채비율 추이 — 자본 대비 부채 · %</div>
          <LineChart
            points={toLinePoints(years.map((y) => ({ label: y.year, resolution: y.resolutions.debt_ratio })))}
            unit="%"
            color="var(--chart-4)"
            baseline={{ value: 100, label: "100%" }}
          />
        </>
      )}

      {showCoverageTrend && (
        <>
          <div className={styles.sectionTitle}>
            이자보상배율 추이 — 영업이익으로 이자를 몇 번 갚나 · 배
            <span className={styles.axisNote}>1배 미만 = 벌어서 이자도 못 낸다</span>
          </div>
          <LineChart
            points={toLinePoints(years.map((y) => ({ label: y.year, resolution: y.resolutions.interest_coverage })))}
            unit="배"
            color="var(--chart-3)"
            baseline={{ value: 1, label: "1배" }}
          />
        </>
      )}

      <div className={styles.fieldList}>
        {PROFILE_CATALOG[profile].stability.map((metric) => (
          <GatedField key={metric.key} ctx={ctx} metric={metric} resolution={current.resolutions[metric.key]} />
        ))}
        <RawField ctx={ctx} metricKey="equity_ratio" label="자기자본비율" unit="PCT" panelUnit="PCT" resolution={current.resolutions.equity_ratio} />
      </div>

      <NotInProfileBlock ctx={ctx} title="표준 프로필 전용 안정성 지표 (해당 없음 — 금융업은 BIS·NCR·K-ICS로 본다)" keys={naKeys} sourceProfile="STANDARD" />
    </section>
  );
}

/* ── ⑥ 주주환원 ─────────────────────────────────────────────────────────── */

function ShareholderReturnSection({
  ctx,
  years,
  current,
  epsQuarters,
}: {
  ctx: FieldContext;
  years: StockYearView[];
  current: StockYearView;
  epsQuarters: DerivedQuarterSeries["points"];
}) {
  const r = current.resolutions;
  const payoutConflictNote = dividendPayoutConflictNote(r.dividend_payout_indx, r.dividend_payout_fallback);
  const hasQuarterlyEps = epsQuarters.some((p) => p.resolution.displayState === "OK");

  return (
    <section className={styles.section}>
      <h2>⑥ 주주환원 — &ldquo;내 1주 몫으로 보면, 그리고 돌려주는가&rdquo;</h2>

      <div className={styles.sectionTitle}>연간 EPS(주당순이익) 추이 — 1주가 벌어준 돈 · 원</div>
      <QuarterBars bars={years.map((y) => ({ label: `${y.year}`, value: y.resolutions.eps_basic?.normalized ?? null }))} unit="원" />

      {hasQuarterlyEps && (
        <>
          <div className={styles.sectionTitle}>분기 EPS 추이 — 단일분기 · 원</div>
          <QuarterBars bars={epsQuarters.map((p) => ({ label: p.label, value: p.resolution.normalized, provisional: p.provisional }))} unit="원" />
        </>
      )}

      <div className={styles.sectionTitle}>BPS(주당순자산) 추이 — 지금 청산하면 1주당 받는 돈 · 원</div>
      <QuarterBars bars={years.map((y) => ({ label: `${y.year}`, value: y.resolutions.bps?.normalized ?? null }))} unit="원" />

      <div className={styles.fieldList}>
        <RawField ctx={ctx} metricKey="eps_basic" label="기본주당이익(EPS, 재무제표)" unit="WON" panelUnit="KRW" resolution={r.eps_basic} />
        <RawField ctx={ctx} metricKey="eps_alotmatter" label="주당순이익(배당공시)" unit="WON" panelUnit="KRW" resolution={r.eps_alotmatter} />
        <RawField ctx={ctx} metricKey="bps" label="BPS(주당순자산 = 지배주주지분 ÷ 발행주식총수)" unit="WON" panelUnit="KRW" resolution={r.bps} />
        <RawField ctx={ctx} metricKey="dps_common" label="주당현금배당금(DPS, 보통주)" unit="WON" panelUnit="KRW" resolution={r.dps_common} zeroByFactNote="무배당 확인" />
        <RawField
          ctx={ctx}
          metricKey="dividend_payout_indx"
          label="배당성향(DART 산출지표)"
          unit="PCT"
          panelUnit="PCT"
          resolution={r.dividend_payout_indx}
          zeroByFactNote="무배당 확인"
          conflictNote={payoutConflictNote}
        />
        <RawField
          ctx={ctx}
          metricKey="dividend_payout_fallback"
          label="배당성향(fallback: 배당총액÷순이익)"
          unit="PCT"
          panelUnit="PCT"
          resolution={r.dividend_payout_fallback}
          zeroByFactNote="무배당 확인"
          conflictNote={payoutConflictNote}
        />
        <RawField ctx={ctx} metricKey="shares_outstanding" label="발행주식총수" unit="SHARES" panelUnit="X" resolution={r.shares_outstanding} />
        <RawField ctx={ctx} metricKey="treasury_shares" label="자기주식수" unit="SHARES" panelUnit="X" resolution={r.treasury_shares} />
      </div>
    </section>
  );
}

/* ── ⑦ 밸류에이션 ───────────────────────────────────────────────────────── */

function ValuationSection({ ctx, current }: { ctx: FieldContext; current: StockYearView }) {
  return (
    <section className={styles.section}>
      <h2>⑦ 밸류에이션 — &ldquo;지금 가격이 싼가 비싼가&rdquo;</h2>
      <p className={styles.gapNote}>
        <strong>7셋 중 이 항목만 DART로 채울 수 없다.</strong> 밸류에이션은 &ldquo;회사의 실력(EPS·BPS)&rdquo;과 &ldquo;시장이 매긴 가격(주가)&rdquo;의
        비교인데, DART OpenAPI는 <strong>공시 서류</strong>만 제공하고 <strong>시세는 제공하지 않는다</strong>. 아래 4개 항목의 분자에 해당하는 주가를 얻으려면
        별도 시세 API(예: 공공데이터포털 금융위원회_주식시세정보)를 연동해야 한다 — 이번 프로토타입 범위 밖이라 근거 없는 숫자를 채우지 않고 그대로 비워 둔다.
      </p>
      <div className={styles.valuationGrid}>
        <div className={styles.field}>
          <div className={styles.fieldLabel}>종가</div>
          <MetricValue state="SOURCE_NOT_AVAILABLE" unit="WON" note="시세 API 미연동" />
        </div>
        <div className={styles.field}>
          <div className={styles.fieldLabel}>시가총액 (= 종가 × 발행주식총수)</div>
          <MetricValue state="SOURCE_NOT_AVAILABLE" unit="KRW" note="종가 미확보" />
        </div>
        <div className={styles.field}>
          <div className={styles.fieldLabel}>PER (= 종가 ÷ EPS)</div>
          <MetricValue state="SOURCE_NOT_AVAILABLE" unit="X" note="종가 미확보 · 적자 시 N/A 규칙 적용 예정" />
        </div>
        <div className={styles.field}>
          <div className={styles.fieldLabel}>PBR (= 종가 ÷ BPS)</div>
          <MetricValue state="SOURCE_NOT_AVAILABLE" unit="X" note="종가 미확보" />
        </div>
      </div>
      <div className={styles.sectionTitle}>배당수익률 — 유일하게 DART로 채워지는 밸류에이션 항목</div>
      <div className={styles.fieldList}>
        <RawField
          ctx={ctx}
          metricKey="dividend_yield_common"
          label="현금배당수익률(보통주, 배당공시 원본)"
          unit="PCT"
          panelUnit="PCT"
          resolution={current.resolutions.dividend_yield_common}
          zeroByFactNote="무배당 확인"
        />
      </div>
      <p className={styles.noteText}>
        배당수익률은 &ldquo;DPS ÷ 주가&rdquo;라 원래는 주가가 필요하지만, DART 배당공시(alotMatter)가 회사가 계산한 값을 그대로 실어 주기 때문에 이 항목만
        시세 없이도 채울 수 있다.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

const VIEW_TABS: { id: ViewMode; label: string; hint: string }[] = [
  { id: "data", label: "데이터", hint: "클라이언트 제공 화면 — 수치와 차트만" },
  { id: "trace", label: "원천 추적", hint: "지표마다 DART 원문·폴백 이력·계산식까지" },
];

export default async function StockDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ year?: string; view?: string }>;
}) {
  const { code } = await params;
  const row = UNIVERSE.find((r) => r.stockCode === code);
  if (!row) notFound();

  const years = availableYears();
  const query = await searchParams;
  // 알 수 없는 연도가 오면 404가 아니라 최신 연도로 떨어뜨린다 — 링크 오타로 화면이 죽지 않게.
  const selectedYear = query.year && years.includes(query.year) ? query.year : years[years.length - 1];
  // 기본은 클라이언트 화면이다 — 시연 중 실수로 내부 추적 정보가 노출되지 않게 하는 쪽이 안전하다.
  const view: ViewMode = query.view === "trace" ? "trace" : "data";
  const hrefWith = (next: { year?: string; view?: ViewMode }) =>
    `/stock/${row.stockCode}?year=${next.year ?? selectedYear}&view=${next.view ?? view}`;

  const profile = profileIdOf(row);
  const yearViews = years.map((year) => loadStockYearView(row, year));
  const current = yearViews.find((y) => y.year === selectedYear)!;
  const ctx: FieldContext = { corpCode: row.corpCode, profile, year: selectedYear, view };

  const quarterSeries: Record<string, DerivedQuarterSeries["points"]> = {
    revenue: loadQuarterSeries(row, "revenue"),
    operating_income: loadQuarterSeries(row, "operating_income"),
    eps_basic: loadQuarterSeries(row, "eps_basic"),
  };

  const coverage = summarizeCoverage(profile, current.resolutions);
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
        <div className={styles.tabBar}>
          <nav className={styles.yearTabs} aria-label="기준 연도 선택">
            {years.map((y) => (
              <Link key={y} href={hrefWith({ year: y })} className={`${styles.yearTab} ${y === selectedYear ? styles.yearTabActive : ""}`} aria-current={y === selectedYear}>
                {y}
              </Link>
            ))}
          </nav>
          <nav className={styles.viewTabs} aria-label="화면 모드 선택">
            {VIEW_TABS.map((tab) => (
              <Link
                key={tab.id}
                href={hrefWith({ view: tab.id })}
                title={tab.hint}
                className={`${styles.viewTab} ${tab.id === view ? styles.viewTabActive : ""}`}
                aria-current={tab.id === view}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className={styles.headMeta}>
          {row.market === "Y" ? "코스피" : row.market === "K" ? "코스닥" : row.market} · 기준연도 {selectedYear} · 기준 {basisLabel(current.fsDiv)}
          {current.fsDivFallbackApplied && " (연결재무제표 미작성 → 별도 기준)"}
          {view === "trace" && ` · 커버리지 ${coveragePct}% (${coverage.hit}/${coverage.total})`}
        </p>
        {view === "trace" && <p className={styles.traceBanner}>원천 추적 모드 — 지표마다 붙은 &ldquo;출처&rdquo;를 펼치면 요청 URL·원본 JSON·폴백 이력·계산식을 볼 수 있다. 클라이언트 시연에는 &ldquo;데이터&rdquo; 탭을 쓴다.</p>}
      </header>

      <OverviewSection ctx={ctx} row={row} />
      <PnlSection ctx={ctx} years={yearViews} current={current} quarterSeries={quarterSeries} />
      <BalanceSection ctx={ctx} years={yearViews} current={current} />
      <CashFlowSection ctx={ctx} current={current} />
      <ProfitabilitySection ctx={ctx} years={yearViews} current={current} />
      <StabilitySection ctx={ctx} years={yearViews} current={current} />
      <ShareholderReturnSection ctx={ctx} years={yearViews} current={current} epsQuarters={quarterSeries.eps_basic} />
      <ValuationSection ctx={ctx} current={current} />
    </main>
  );
}
