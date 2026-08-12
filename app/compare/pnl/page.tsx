import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Metadata } from "next";

import MetricValue from "@/components/MetricValue";
import PnlWaterfall from "@/components/charts/PnlWaterfall";
import StackedBar100 from "@/components/charts/StackedBar100";
import SourcePanel from "@/components/SourcePanel";
import { findStockByCode, findYear, loadDerived } from "@/lib/derived";
import { toEok } from "@/lib/format";
import type { FsDiv } from "@/lib/normalize/resolve";
import { resolveFinHoldingExtras } from "@/lib/normalize/resolveFinHoldingExtras";
import type { ProfileId, Resolution } from "@/lib/normalize/types";
import { findProfileMetric, pnlKeysOnlyIn, PROFILE_CATALOG, resolveDisplay, summarizePnlCoverage, withDisplayState } from "@/lib/profiles";
import type { ProfileMetric } from "@/lib/profiles";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "compare/pnl — 삼성전자 vs KB금융",
};

/**
 * T7 — 프로필 엔진 + 삼성전자 vs KB금융 손익 비교.
 *
 * 김예지의 "비금융 공통 ≠ 모든 종목 공통"을 실제 API 값으로 증명하는 화면. 좌(삼성전자
 * STANDARD)와 우(KB금융 FIN_HOLDING)가 서로 다른 차트 컴포넌트(PnlWaterfall vs
 * StackedBar100)로 렌더되는 이유는 이 파일이 조건 분기를 해서가 아니라 lib/profiles.ts의
 * `PROFILE_CATALOG`가 프로필마다 다르기 때문이다 — 이 화면 어디에도 "revenue"/"net_income" 같은
 * 지표 키를 조건문에 직접 쓰지 않는다(순회·차집합 계산만 한다). profiles.ts 한 파일만 고치면
 * (항목 추가/삭제/주석 처리) 여기 표시되는 지표가 그대로 바뀐다.
 *
 * KB금융의 net_interest_income 등 6개 손익 후보는 data/derived.json(T4 산출물, 불변)에
 * 없다 — lib/normalize/resolveFinHoldingExtras.ts가 요청 시점에 스냅샷에서 직접 해석하고,
 * derived.json에는 절대 기록하지 않는다. 서버 컴포넌트 — 전부 정적 fs 읽기, 클라이언트 JS는
 * SourcePanel 내부(T5)에만 있다.
 */

const YEAR = "2024";
const SNAPSHOTS_DIR = join(process.cwd(), "public", "snapshots");

const basisLabel = (fsDiv: FsDiv) => (fsDiv === "CFS" ? ("연결" as const) : ("별도" as const));

function acntAllRequestId(corpCode: string, year: string, fsDiv: FsDiv): string {
  return `fnlttSinglAcntAll__${corpCode}__${year}__11011__${fsDiv}`;
}

function acntAllProbeParams(corpCode: string, year: string, fsDiv: FsDiv): Record<string, string> {
  return { endpoint: "fnlttSinglAcntAll", corp_code: corpCode, bsns_year: year, reprt_code: "11011", fs_div: fsDiv };
}

/** rcept_no(접수번호) 앞 8자리가 접수일(YYYYMMDD)이다 — T5 debug/source-panel과 동일한 패턴. */
function reportDateFromSnapshot(requestId: string): string {
  try {
    const raw = readFileSync(join(SNAPSHOTS_DIR, `${requestId}.json`), "utf-8");
    const data = JSON.parse(raw) as { body?: { list?: { rcept_no?: string }[] } };
    const rcept = data.body?.list?.[0]?.rcept_no;
    if (rcept && rcept.length >= 8) {
      return `${rcept.slice(0, 4)}.${rcept.slice(4, 6)}.${rcept.slice(6, 8)}`;
    }
  } catch {
    // 스냅샷이 없거나 rcept_no가 없으면 "-"로 대체 — 방어 코드.
  }
  return "-";
}

function buildSourcePanelProps(corpCode: string, year: string, metric: ProfileMetric, resolution: Resolution) {
  const requestId = acntAllRequestId(corpCode, year, resolution.fsDiv);
  return {
    resolution,
    requestId,
    probeParams: acntAllProbeParams(corpCode, year, resolution.fsDiv),
    summaryMeta: {
      source: "DART 사업보고서",
      basis: basisLabel(resolution.fsDiv),
      asOf: reportDateFromSnapshot(requestId),
      parserVersion: resolution.parserVersion,
      unit: metric.unit,
    },
  };
}

function chartTagClass(chart: ProfileMetric["chart"]): string {
  if (chart === "waterfall") return `${styles.chartTag} ${styles.waterfall}`;
  if (chart === "stacked") return `${styles.chartTag} ${styles.stacked}`;
  if (chart === "deduction") return `${styles.chartTag} ${styles.deduction}`;
  return styles.chartTag;
}

/** MetricValue + SourcePanel 한 벌 — displayState는 항상 resolveDisplay(T7 판정)로 계산하고, SourcePanel에도 동일하게 반영한다. */
function MetricSlot({
  profile,
  corpCode,
  year,
  metric,
  resolution,
}: {
  profile: ProfileId;
  corpCode: string;
  year: string;
  metric: ProfileMetric;
  resolution?: Resolution;
}) {
  const state = resolveDisplay(profile, metric.key, resolution);
  const value = state === "OK" && resolution?.normalized != null ? (metric.unit === "KRW" ? toEok(resolution.normalized) : resolution.normalized) : undefined;
  const note = state === "NOT_IN_PROFILE" ? (profile === "STANDARD" ? "표준 프로필" : "금융 프로필") : state === "SOURCE_NOT_AVAILABLE" ? "DART 미제공" : undefined;

  return (
    <div className={styles.metric}>
      <div className={styles.metricLabel}>{metric.label}</div>
      <MetricValue state={state} value={value} unit={metric.unit} basis={resolution ? basisLabel(resolution.fsDiv) : undefined} note={note} />
      {resolution && <SourcePanel {...buildSourcePanelProps(corpCode, year, metric, withDisplayState(resolution, state))} />}
    </div>
  );
}

/** 차트(워터폴/스택)에 이미 숫자가 그려진 항목용 — 중복 표기 없이 출처 collapse만 붙인다. */
function TraceRow({ corpCode, year, metric, resolution }: { corpCode: string; year: string; metric: ProfileMetric; resolution?: Resolution }) {
  if (!resolution) return null;
  return (
    <div className={styles.metric}>
      <div className={styles.metricLabel}>{metric.label}</div>
      <SourcePanel {...buildSourcePanelProps(corpCode, year, metric, resolution)} />
    </div>
  );
}

function SchemaCompareSection() {
  const standard = PROFILE_CATALOG.STANDARD.pnl;
  const finHolding = PROFILE_CATALOG.FIN_HOLDING.pnl;

  return (
    <section className={styles.schemaSection}>
      <h2>고정 스키마 vs 프로필 스키마 대조표</h2>
      <p className={styles.lead}>
        좌우 화면이 서로 다른 차트 컴포넌트(PnlWaterfall vs StackedBar100)로 렌더된 이유는 화면 코드가 종목을 보고
        분기해서가 아니라, <code className="mono">lib/profiles.ts</code>의 아래 두 배열 자체가 다르기 때문이다 —
        원본 카탈로그를 그대로 나열했다.
      </p>
      <div className={styles.schemaGrid}>
        <table className={styles.schemaTable}>
          <caption>PROFILE_CATALOG.STANDARD.pnl ({standard.length}개)</caption>
          <thead>
            <tr>
              <th>key</th>
              <th>label</th>
              <th>chart</th>
              <th>unit</th>
            </tr>
          </thead>
          <tbody>
            {standard.map((m) => (
              <tr key={m.key}>
                <td className="mono">{m.key}</td>
                <td>{m.label}</td>
                <td>
                  <span className={chartTagClass(m.chart)}>{m.chart ?? "none"}</span>
                </td>
                <td className="mono">{m.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className={styles.schemaTable}>
          <caption>PROFILE_CATALOG.FIN_HOLDING.pnl ({finHolding.length}개)</caption>
          <thead>
            <tr>
              <th>key</th>
              <th>label</th>
              <th>chart</th>
              <th>unit</th>
            </tr>
          </thead>
          <tbody>
            {finHolding.map((m) => (
              <tr key={m.key}>
                <td className="mono">{m.key}</td>
                <td>{m.label}</td>
                <td>
                  <span className={chartTagClass(m.chart)}>{m.chart ?? "none"}</span>
                </td>
                <td className="mono">{m.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.footnote}>
        공유 키(operating_income · net_income)는 두 배열 모두에 등장한다 — 한쪽 카탈로그에만 있는 키(revenue ·
        gross_profit · operating_margin)만 반대쪽 화면에서 NOT_IN_PROFILE(해당 없음)로 판정된다. 이 파일에서
        항목 하나를 주석 처리하면 위 표와 비교 화면이 동시에 바뀐다 — 화면 컴포넌트 수정이 필요 없다.
      </p>
    </section>
  );
}

export default function ComparePnlPage() {
  const derived = loadDerived();

  // 좌: 삼성전자 (STANDARD)
  const samsung = findStockByCode(derived, "005930");
  const samsungYear = findYear(samsung, YEAR);

  const waterfallMetrics = PROFILE_CATALOG.STANDARD.pnl.filter((m) => m.chart === "waterfall");
  const waterfallRows = waterfallMetrics.map((metric) => {
    const resolution = samsungYear.resolutions[metric.key];
    const state = resolveDisplay("STANDARD", metric.key, resolution);
    const value = state === "OK" && resolution?.normalized != null ? toEok(resolution.normalized) : null;
    return { metric, resolution, value };
  });
  const baseValue = waterfallRows[0]?.value ?? null;
  const waterfallChartRows = waterfallRows.map((r) => ({
    label: r.metric.label,
    value: r.value,
    ratioPct: r.value !== null && baseValue !== null && baseValue !== 0 ? (r.value / baseValue) * 100 : null,
  }));

  // 리뷰 픽스 2: 고정 키(.find(k === "operating_margin")!) 대신 chart 값으로 동적 순회한다 —
  // profiles.ts에서 이 항목을 지워도 빈 배열이 될 뿐 크래시하지 않는다("단일 파일 수정만으로
  // 지표 변경" 완료판정을 실제로 만족시키려면 화면이 고정 키에 의존하면 안 된다).
  const ratioMetrics = PROFILE_CATALOG.STANDARD.pnl.filter((m) => m.chart === "none");
  const standardCoverage = summarizePnlCoverage("STANDARD", samsungYear.resolutions);

  // 우: KB금융 (FIN_HOLDING) — derived.json(operating_income/net_income 등) + 요청 시점 추가 해석(6종) 병합
  const kb = findStockByCode(derived, "105560");
  const kbYear = findYear(kb, YEAR);
  const kbExtras = resolveFinHoldingExtras(SNAPSHOTS_DIR, kb.corpCode, YEAR);
  const kbResolutions: Record<string, Resolution> = { ...kbYear.resolutions, ...kbExtras.resolutions };

  const stackedMetrics = PROFILE_CATALOG.FIN_HOLDING.pnl.filter((m) => m.chart === "stacked");
  // 리뷰 픽스 1: credit_loss_allowance 등 비용성 항목 — 위 stackedMetrics 합계에서 차감되는
  // 개념이라 100% 스택에는 넣지 않고 별도 구획에 실제 부호 그대로 노출한다.
  const deductionMetrics = PROFILE_CATALOG.FIN_HOLDING.pnl.filter((m) => m.chart === "deduction");
  const referenceMetrics = PROFILE_CATALOG.FIN_HOLDING.pnl.filter((m) => m.chart === "none");
  // STANDARD 카탈로그엔 있지만 FIN_HOLDING 카탈로그엔 없는 키 — "해당 없음" 데모행. 화면에
  // "revenue"/"gross_profit"을 직접 쓰지 않고 카탈로그 차집합으로 계산한다.
  const naKeys = pnlKeysOnlyIn("STANDARD", "FIN_HOLDING");

  const stackedSegments: { label: string; value: number | null }[] = [];
  const negativeSegments: { metric: ProfileMetric; resolution: Resolution }[] = [];
  for (const metric of stackedMetrics) {
    const resolution = kbResolutions[metric.key];
    const state = resolveDisplay("FIN_HOLDING", metric.key, resolution);
    if (state === "OK" && resolution?.normalized != null && resolution.normalized > 0) {
      stackedSegments.push({ label: metric.label, value: toEok(resolution.normalized) });
    } else if (state === "OK" && resolution?.normalized != null && resolution.normalized <= 0) {
      // 음수/0 HIT — StackedBar100은 양수 전제라 세그먼트로 넣지 않고 별도로 실제 값을 노출한다
      // (조용히 절대값을 취하거나 숨기지 않는다). 실측 KB FY2024 데이터엔 해당 사례가 없다.
      negativeSegments.push({ metric, resolution });
    } else {
      stackedSegments.push({ label: metric.label, value: null });
    }
  }

  const finHoldingCoverage = summarizePnlCoverage("FIN_HOLDING", kbResolutions);
  const finHoldingStability = PROFILE_CATALOG.FIN_HOLDING.stability;

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>삼성전자 vs KB금융 — 손익 구조 비교 (/compare/pnl)</h1>
      <p className={styles.lead}>
        &quot;비금융 공통&quot;이지 &quot;모든 종목 공통&quot;이 아니다. 표준 프로필(삼성전자)은
        매출→매출총이익→영업이익→순이익 워터폴로 렌더되고, 금융·지주 프로필(KB금융)은 워터폴 없이
        순이자손익·순수수료손익 등으로 구성된 100% 스택으로 렌더된다. 아래 숫자는 전부 실제 DART 값이다
        (하드코딩 0) — collapse를 펼치면 원본 응답과 폴백 이력을 그대로 확인할 수 있다.
      </p>

      <section className={styles.compareGrid}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>{samsung.name}</h2>
            <span className={`${styles.badge} ${styles.standard}`}>STANDARD</span>
          </div>

          <div>
            <div className={styles.sectionTitle}>
              손익 구조 — {YEAR} · {basisLabel(samsungYear.fsDiv)} · 억원
            </div>
            <PnlWaterfall rows={waterfallChartRows} />
          </div>

          <div className={styles.metricList}>
            {waterfallRows.map(({ metric, resolution }) => (
              <TraceRow key={metric.key} corpCode={samsung.corpCode} year={YEAR} metric={metric} resolution={resolution} />
            ))}
            {ratioMetrics.map((metric) => (
              <MetricSlot key={metric.key} profile="STANDARD" corpCode={samsung.corpCode} year={YEAR} metric={metric} resolution={samsungYear.resolutions[metric.key]} />
            ))}
          </div>

          <div className={styles.coverageBox}>
            <span>
              손익 후보 {standardCoverage.total}개 중 {standardCoverage.hit}개 존재
            </span>
            {standardCoverage.missing.length > 0 && (
              <span className={styles.coverageMissing}>미존재: {standardCoverage.missing.map((m) => `${m.label}(${m.state})`).join(", ")}</span>
            )}
          </div>

          <div>
            <div className={styles.sectionTitle}>안정성</div>
            <div className={styles.metricList}>
              {PROFILE_CATALOG.STANDARD.stability.map((metric) => (
                <MetricSlot key={metric.key} profile="STANDARD" corpCode={samsung.corpCode} year={YEAR} metric={metric} resolution={samsungYear.resolutions[metric.key]} />
              ))}
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>{kb.name}</h2>
            <span className={`${styles.badge} ${styles.finHolding}`}>FIN_HOLDING</span>
          </div>

          <div>
            <div className={styles.sectionTitle}>
              손익 구성 — {YEAR} · {basisLabel(kbYear.fsDiv)} · 억원 (워터폴 없음)
            </div>
            <StackedBar100 segments={stackedSegments} />
          </div>

          <div className={styles.metricList}>
            {stackedMetrics.map((metric) => (
              <TraceRow key={metric.key} corpCode={kb.corpCode} year={YEAR} metric={metric} resolution={kbResolutions[metric.key]} />
            ))}
          </div>

          {deductionMetrics.length > 0 && (
            <div className={styles.deductionBlock}>
              <div className={styles.sectionTitle}>차감 항목 (스택 아님)</div>
              <p className={styles.naHint}>
                위 순영업수익성 항목 합계에서 차감되어 영업이익으로 이어지는 비용성 항목이다 — 실측값이 양수여도
                100% 스택에 넣지 않는다(수익 원천처럼 보이는 오독 방지).
              </p>
              <div className={styles.metricList}>
                {deductionMetrics.map((metric) => (
                  <MetricSlot key={metric.key} profile="FIN_HOLDING" corpCode={kb.corpCode} year={YEAR} metric={metric} resolution={kbResolutions[metric.key]} />
                ))}
              </div>
            </div>
          )}

          {negativeSegments.length > 0 && (
            <div className={styles.negativeNote}>
              음수/0 이하로 스택에서 제외됨(절대값 처리 안 함):{" "}
              {negativeSegments.map(({ metric, resolution }) => `${metric.label} ${resolution.normalized?.toLocaleString("ko-KR")}원`).join(", ")}
            </div>
          )}

          <div>
            <div className={styles.sectionTitle}>참고 지표 (스택 세그먼트 아님 — 총계/총액)</div>
            <div className={styles.metricList}>
              {referenceMetrics.map((metric) => (
                <MetricSlot key={metric.key} profile="FIN_HOLDING" corpCode={kb.corpCode} year={YEAR} metric={metric} resolution={kbResolutions[metric.key]} />
              ))}
            </div>
          </div>

          <div className={styles.naBlock}>
            <div className={styles.sectionTitle}>표준 프로필 전용 지표</div>
            <p className={styles.naHint}>
              STANDARD 카탈로그엔 있지만 FIN_HOLDING 카탈로그엔 없는 지표 — profiles.ts 차집합으로 계산됐다(하드코딩
              아님). KB금융엔 그려지지 않는다.
            </p>
            <div className={styles.metricList}>
              {naKeys.map((key) => {
                const metric = findProfileMetric("STANDARD", key);
                if (!metric) return null;
                return <MetricSlot key={key} profile="FIN_HOLDING" corpCode={kb.corpCode} year={YEAR} metric={metric} resolution={kbResolutions[key]} />;
              })}
            </div>
          </div>

          <div className={styles.coverageBox}>
            <span>
              손익 후보 {finHoldingCoverage.total}개 중 {finHoldingCoverage.hit}개 존재 / {finHoldingCoverage.total - finHoldingCoverage.hit}개 미존재
            </span>
            {finHoldingCoverage.missing.length > 0 && (
              <span className={styles.coverageMissing}>미존재: {finHoldingCoverage.missing.map((m) => `${m.label}(${m.state})`).join(", ")}</span>
            )}
          </div>

          <div>
            <div className={styles.sectionTitle}>안정성</div>
            <div className={styles.metricList}>
              {finHoldingStability.map((metric) => (
                <MetricSlot key={metric.key} profile="FIN_HOLDING" corpCode={kb.corpCode} year={YEAR} metric={metric} resolution={undefined} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <SchemaCompareSection />
    </main>
  );
}
