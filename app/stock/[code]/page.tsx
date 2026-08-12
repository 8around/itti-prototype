import type { Metadata } from "next";
import { notFound } from "next/navigation";

import CashFlowDiverging from "@/components/charts/CashFlowDiverging";
import PieChart from "@/components/charts/PieChart";
import PnlWaterfall from "@/components/charts/PnlWaterfall";
import QuarterBars from "@/components/charts/QuarterBars";
import StackedBar100 from "@/components/charts/StackedBar100";
import ZeroAxisBars from "@/components/charts/ZeroAxisBars";
import MetricValue from "@/components/MetricValue";
import type { MetricValueProps } from "@/components/MetricValue";
import SourcePanel from "@/components/SourcePanel";
import { formatEstDt, loadCompany } from "@/lib/company";
import { toEok } from "@/lib/format";
import type { DisplayState, ProfileId, Resolution } from "@/lib/normalize/types";
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
import { loadStockYearView, profileIdOf, UNIVERSE } from "@/lib/stockView";
import type { StockYearView, UniverseRow } from "@/lib/stockView";

import styles from "./page.module.css";

/**
 * T10 — 종목 상세(/stock/[code]). 20종목 전부 이 파일 하나로 렌더된다 — 종목별 분기 없이
 * lib/profiles.ts의 PROFILE_CATALOG를 순회해서 표준/금융 화면 차이를 만들어 낸다
 * (compare/pnl의 조립 패턴을 20종목으로 일반화). 서버 컴포넌트, 연도는 2024 고정
 * (기간 토글은 프로토타입 범위 밖 — 브리프 명시).
 */

const YEAR = "2024";
const ALL_YEARS = ["2023", "2024", "2025"] as const;

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
  resolution,
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
  resolution?: Resolution;
}) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldLabel}>{label}</div>
      <MetricValue state={state} value={value} unit={unit} basis={basis} note={note} />
      {resolution && <SourcePanel {...buildSourcePanelProps(metricKey, corpCode, YEAR, withDisplayState(resolution, state), panelUnit)} />}
    </div>
  );
}

/** 프로필 카탈로그(pnl/stability)에 등록된 지표 — NOT_IN_PROFILE/SOURCE_NOT_AVAILABLE 판정을 거친다. */
function GatedField({ profile, corpCode, metric, resolution }: { profile: ProfileId; corpCode: string; metric: ProfileMetric; resolution?: Resolution }) {
  const state = resolveDisplay(profile, metric.key, resolution);
  const value = state === "OK" && resolution?.normalized != null ? toDisplayValue(resolution.normalized, metric.unit) : undefined;
  return (
    <FieldRow
      label={metric.label}
      state={state}
      value={value}
      unit={metric.unit}
      panelUnit={metric.unit}
      note={defaultNoteFor(state, profile)}
      basis={resolution ? basisLabel(resolution.fsDiv) : undefined}
      metricKey={metric.key}
      corpCode={corpCode}
      resolution={resolution}
    />
  );
}

/** 카탈로그에 없는 보편 지표(ROE·ROA·EPS·DPS·자산총계 등) — 모든 프로필에 동일 개념으로 존재해 프로필 게이팅을 거치지 않는다. */
function RawField({
  corpCode,
  metricKey,
  label,
  unit,
  panelUnit,
  resolution,
  zeroByFactNote,
}: {
  corpCode: string;
  metricKey: string;
  label: string;
  unit: NonNullable<MetricValueProps["unit"]>;
  panelUnit: "KRW" | "PCT" | "X";
  resolution?: Resolution;
  /** ZERO_BY_FACT일 때 보여줄 문구 — 배당 계열 지표에서 "무배당 확인"으로 쓰인다. */
  zeroByFactNote?: string;
}) {
  const state = resolution?.displayState ?? "MISSING";
  const value = state === "OK" && resolution?.normalized != null ? toDisplayValue(resolution.normalized, unit) : undefined;
  const note = state === "ZERO_BY_FACT" ? zeroByFactNote : state === "NA_NEGATIVE_BASE" ? "분모 음수" : undefined;
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
      resolution={resolution}
    />
  );
}

/** 차트가 이미 값을 그린 지표용 — 중복 숫자 표기 없이 출처 collapse만 붙인다(compare/pnl TraceRow와 동일 패턴). */
function TraceOnly({ profile, corpCode, metric, resolution }: { profile: ProfileId; corpCode: string; metric: ProfileMetric; resolution?: Resolution }) {
  if (!resolution) return null;
  const state = resolveDisplay(profile, metric.key, resolution);
  return (
    <div className={styles.field}>
      <div className={styles.fieldLabel}>{metric.label}</div>
      <SourcePanel {...buildSourcePanelProps(metric.key, corpCode, YEAR, withDisplayState(resolution, state), metric.unit)} />
    </div>
  );
}

function eok(resolution: Resolution | undefined): number | null {
  return resolution?.normalized != null ? toEok(resolution.normalized) : null;
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

function PnlSection({ profile, corpCode, years }: { profile: ProfileId; corpCode: string; years: StockYearView[] }) {
  const y2024 = years.find((y) => y.year === "2024")!;
  const coverage = summarizePnlCoverage(profile, y2024.resolutions);

  if (profile === "STANDARD") {
    const waterfallMetrics = PROFILE_CATALOG.STANDARD.pnl.filter((m) => m.chart === "waterfall");
    const waterfallRows = waterfallMetrics.map((metric) => {
      const resolution = y2024.resolutions[metric.key];
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

    const revenueBars = [
      ...years.map((y) => ({ label: `${y.year.slice(2)}년`, value: eok(y.resolutions.revenue) })),
      { label: "24 Q4(역산)", value: eok(y2024.resolutions.q4_revenue), provisional: true },
    ];
    const operatingIncomeBars = [
      ...years.map((y) => ({ label: `${y.year.slice(2)}년`, value: eok(y.resolutions.operating_income) })),
      { label: "24 Q4(역산)", value: eok(y2024.resolutions.q4_operating_income), provisional: true },
    ];
    const netIncomeBars = years.map((y) => ({ label: `${y.year.slice(2)}년`, value: eok(y.resolutions.net_income) }));

    return (
      <section className={styles.section}>
        <h2>② 손익</h2>
        <div className={styles.sectionTitle}>
          손익 구조 — {YEAR} · {basisLabel(y2024.fsDiv)} · 억원
        </div>
        <PnlWaterfall rows={chartRows} />
        <div className={styles.fieldList}>
          {waterfallRows.map(({ metric, resolution }) => (
            <TraceOnly key={metric.key} profile={profile} corpCode={corpCode} metric={metric} resolution={resolution} />
          ))}
          {ratioMetrics.map((metric) => (
            <GatedField key={metric.key} profile={profile} corpCode={corpCode} metric={metric} resolution={y2024.resolutions[metric.key]} />
          ))}
        </div>

        <div className={styles.sectionTitle}>매출액 추이 — 연간 3개년 + 24년 4분기(역산, 잠정) · 억원</div>
        <QuarterBars bars={revenueBars} unit="억원" />

        <div className={styles.sectionTitle}>영업이익 추이 — 연간 3개년 + 24년 4분기(역산, 잠정) · 억원</div>
        <QuarterBars bars={operatingIncomeBars} unit="억원" />

        <div className={styles.sectionTitle}>당기순이익 추이 — 0 기준 발산 막대(적자 구간 자동 표현) · 억원</div>
        <ZeroAxisBars bars={netIncomeBars} />

        <div className={styles.coverageBox}>
          손익 후보 {coverage.total}개 중 {coverage.hit}개 존재
          {coverage.missing.length > 0 && <span className={styles.coverageMissing}> · 미존재: {coverage.missing.map((m) => `${m.label}(${m.state})`).join(", ")}</span>}
        </div>
      </section>
    );
  }

  // 금융 프로필(FIN_HOLDING/FIN_BANK/FIN_SECURITIES/FIN_INSURANCE) — StackedBar100 + 차감 구획.
  const stackedMetrics = PROFILE_CATALOG[profile].pnl.filter((m) => m.chart === "stacked");
  const deductionMetrics = PROFILE_CATALOG[profile].pnl.filter((m) => m.chart === "deduction");
  const referenceMetrics = PROFILE_CATALOG[profile].pnl.filter((m) => m.chart === "none");
  const naKeys = pnlKeysOnlyIn("STANDARD", profile);

  const segments: { label: string; value: number | null }[] = [];
  const negativeSegments: { metric: ProfileMetric; resolution: Resolution }[] = [];
  for (const metric of stackedMetrics) {
    const resolution = y2024.resolutions[metric.key];
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
      <h2>② 손익</h2>
      <div className={styles.sectionTitle}>
        손익 구성 — {YEAR} · {basisLabel(y2024.fsDiv)} · 억원 (워터폴 없음 — 금융 프로필은 표준 손익계정 체계를 따르지 않는다)
      </div>
      <StackedBar100 segments={segments} />
      <div className={styles.fieldList}>
        {stackedMetrics.map((metric) => (
          <TraceOnly key={metric.key} profile={profile} corpCode={corpCode} metric={metric} resolution={y2024.resolutions[metric.key]} />
        ))}
      </div>

      {deductionMetrics.length > 0 && (
        <div className={styles.deductionBlock}>
          <div className={styles.sectionTitle}>차감 항목 (스택 아님 — 순영업수익에서 차감되는 비용성 항목)</div>
          <div className={styles.fieldList}>
            {deductionMetrics.map((metric) => (
              <GatedField key={metric.key} profile={profile} corpCode={corpCode} metric={metric} resolution={y2024.resolutions[metric.key]} />
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
          <GatedField key={metric.key} profile={profile} corpCode={corpCode} metric={metric} resolution={y2024.resolutions[metric.key]} />
        ))}
      </div>

      {naKeys.length > 0 && (
        <div className={styles.naBlock}>
          <div className={styles.sectionTitle}>표준 프로필 전용 지표 (해당 없음)</div>
          <div className={styles.fieldList}>
            {naKeys.map((key) => {
              const metric = findProfileMetric("STANDARD", key);
              if (!metric) return null;
              return <GatedField key={key} profile={profile} corpCode={corpCode} metric={metric} resolution={y2024.resolutions[key]} />;
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

function BalanceSection({ corpCode, y2024 }: { corpCode: string; y2024: StockYearView }) {
  const liab = eok(y2024.resolutions.total_liabilities);
  const equity = eok(y2024.resolutions.total_equity);
  return (
    <section className={styles.section}>
      <h2>③ 재무상태</h2>
      <div className={styles.sectionTitle}>
        자산 구성(부채+자본) — {YEAR} · {basisLabel(y2024.fsDiv)} · 억원
      </div>
      <PieChart slices={[{ label: "부채", value: liab }, { label: "자본", value: equity }]} />
      <div className={styles.fieldList}>
        <RawField corpCode={corpCode} metricKey="total_assets" label="자산총계" unit="KRW" panelUnit="KRW" resolution={y2024.resolutions.total_assets} />
        <RawField corpCode={corpCode} metricKey="total_liabilities" label="부채총계" unit="KRW" panelUnit="KRW" resolution={y2024.resolutions.total_liabilities} />
        <RawField corpCode={corpCode} metricKey="total_equity" label="자본총계" unit="KRW" panelUnit="KRW" resolution={y2024.resolutions.total_equity} />
        <RawField corpCode={corpCode} metricKey="equity_attributable_to_owners" label="지배주주지분" unit="KRW" panelUnit="KRW" resolution={y2024.resolutions.equity_attributable_to_owners} />
      </div>
    </section>
  );
}

function CashFlowSection({ corpCode, y2024 }: { corpCode: string; y2024: StockYearView }) {
  const rows = [
    { label: "영업", value: eok(y2024.resolutions.operating_cf) },
    { label: "투자", value: eok(y2024.resolutions.investing_cf) },
    { label: "재무", value: eok(y2024.resolutions.financing_cf) },
  ];
  return (
    <section className={styles.section}>
      <h2>④ 현금흐름</h2>
      <div className={styles.sectionTitle}>
        현금흐름 — {YEAR} · {basisLabel(y2024.fsDiv)} · 억원
      </div>
      <CashFlowDiverging rows={rows} />
      <div className={styles.fieldList}>
        <TraceOnly profile="STANDARD" corpCode={corpCode} metric={{ key: "operating_cf", label: "영업활동현금흐름", sourceAvailable: true, unit: "KRW" }} resolution={y2024.resolutions.operating_cf} />
        <TraceOnly profile="STANDARD" corpCode={corpCode} metric={{ key: "investing_cf", label: "투자활동현금흐름", sourceAvailable: true, unit: "KRW" }} resolution={y2024.resolutions.investing_cf} />
        <TraceOnly profile="STANDARD" corpCode={corpCode} metric={{ key: "financing_cf", label: "재무활동현금흐름", sourceAvailable: true, unit: "KRW" }} resolution={y2024.resolutions.financing_cf} />
        <RawField corpCode={corpCode} metricKey="fcf" label="잉여현금흐름(FCF = 영업CF − CAPEX)" unit="KRW" panelUnit="KRW" resolution={y2024.resolutions.fcf} />
      </div>
    </section>
  );
}

function ProfitabilitySection({ profile, corpCode, y2024 }: { profile: ProfileId; corpCode: string; y2024: StockYearView }) {
  const marginMetric = findProfileMetric("STANDARD", "operating_margin")!;
  return (
    <section className={styles.section}>
      <h2>⑤ 수익성</h2>
      <div className={styles.fieldList}>
        <RawField corpCode={corpCode} metricKey="roe" label="ROE(자기자본이익률, DART 산출)" unit="PCT" panelUnit="PCT" resolution={y2024.resolutions.roe} />
        <RawField corpCode={corpCode} metricKey="roa" label="ROA(총자산이익률, 계산: 순이익÷자산총계)" unit="PCT" panelUnit="PCT" resolution={y2024.resolutions.roa} />
        <GatedField profile={profile} corpCode={corpCode} metric={marginMetric} resolution={y2024.resolutions.operating_margin} />
      </div>
    </section>
  );
}

function StabilitySection({ profile, corpCode, y2024 }: { profile: ProfileId; corpCode: string; y2024: StockYearView }) {
  return (
    <section className={styles.section}>
      <h2>⑥ 안정성</h2>
      <div className={styles.fieldList}>
        {PROFILE_CATALOG[profile].stability.map((metric) => (
          <GatedField key={metric.key} profile={profile} corpCode={corpCode} metric={metric} resolution={y2024.resolutions[metric.key]} />
        ))}
      </div>
    </section>
  );
}

function ShareholderReturnSection({ corpCode, y2024 }: { corpCode: string; y2024: StockYearView }) {
  const r = y2024.resolutions;
  return (
    <section className={styles.section}>
      <h2>⑦ 주주환원</h2>
      <div className={styles.fieldList}>
        <RawField corpCode={corpCode} metricKey="eps_basic" label="기본주당이익(EPS, 재무제표)" unit="WON" panelUnit="KRW" resolution={r.eps_basic} />
        <RawField corpCode={corpCode} metricKey="eps_alotmatter" label="주당순이익(배당공시)" unit="WON" panelUnit="KRW" resolution={r.eps_alotmatter} />
        <RawField corpCode={corpCode} metricKey="dps_common" label="주당현금배당금(DPS, 보통주)" unit="WON" panelUnit="KRW" resolution={r.dps_common} zeroByFactNote="무배당 확인" />
        <RawField corpCode={corpCode} metricKey="dividend_yield_common" label="현금배당수익률(보통주)" unit="PCT" panelUnit="PCT" resolution={r.dividend_yield_common} zeroByFactNote="무배당 확인" />
        <RawField corpCode={corpCode} metricKey="dividend_payout_indx" label="배당성향(DART 산출지표)" unit="PCT" panelUnit="PCT" resolution={r.dividend_payout_indx} zeroByFactNote="무배당 확인" />
        <RawField corpCode={corpCode} metricKey="dividend_payout_fallback" label="배당성향(fallback: 배당총액÷순이익)" unit="PCT" panelUnit="PCT" resolution={r.dividend_payout_fallback} zeroByFactNote="무배당 확인" />
        <RawField corpCode={corpCode} metricKey="shares_outstanding" label="발행주식총수" unit="SHARES" panelUnit="X" resolution={r.shares_outstanding} />
        <RawField corpCode={corpCode} metricKey="treasury_shares" label="자기주식수" unit="SHARES" panelUnit="X" resolution={r.treasury_shares} />
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
      <p className={styles.valuationHint}>DART 재무 API는 시세를 제공하지 않는다 — 시세 연동은 이 프로토타입 범위 밖이다(정직하게 미확보로 표기).</p>
    </section>
  );
}

export default async function StockDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const row = UNIVERSE.find((r) => r.stockCode === code);
  if (!row) notFound();

  const profile = profileIdOf(row);
  const years = ALL_YEARS.map((year) => loadStockYearView(row, year));
  const y2024 = years.find((y) => y.year === "2024")!;
  const coverage = summarizeCoverage(profile, y2024.resolutions);
  const coveragePct = Math.round((coverage.hit / coverage.total) * 100);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.headTop}>
          <h1>
            {row.name} <span className="mono">({row.stockCode})</span>
          </h1>
          <span className={`${styles.badge} ${profile === "STANDARD" ? styles.badgeStandard : styles.badgeFin}`}>{PROFILE_LABEL[profile]}</span>
          {row.accMt !== "12" && <span className={styles.fyBadge}>결산월 {row.accMt}월(비12월)</span>}
        </div>
        <p className={styles.headMeta}>
          {row.market === "Y" ? "코스피" : row.market === "K" ? "코스닥" : row.market} · 기준연도 {YEAR}(고정) · 기준 {basisLabel(y2024.fsDiv)}
          {y2024.fsDivFallbackApplied && " (CFS 미작성 → OFS 폴백)"} · 커버리지 {coveragePct}% ({coverage.hit}/{coverage.total})
        </p>
      </header>

      <ValuationStrip />

      <OverviewSection row={row} profile={profile} />
      <PnlSection profile={profile} corpCode={row.corpCode} years={years} />
      <BalanceSection corpCode={row.corpCode} y2024={y2024} />
      <CashFlowSection corpCode={row.corpCode} y2024={y2024} />
      <ProfitabilitySection profile={profile} corpCode={row.corpCode} y2024={y2024} />
      <StabilitySection profile={profile} corpCode={row.corpCode} y2024={y2024} />
      <ShareholderReturnSection corpCode={row.corpCode} y2024={y2024} />
    </main>
  );
}
