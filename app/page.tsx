import type { Metadata } from "next";
import Link from "next/link";

import MetricValue from "@/components/MetricValue";
import { toEok } from "@/lib/format";
import { findProfileMetric, PROFILE_CATALOG, resolveDisplay, summarizeCoverage } from "@/lib/profiles";
import { loadStockYearView, profileIdOf, UNIVERSE } from "@/lib/stockView";
import type { ProfileId } from "@/lib/normalize/types";
import type { ProfileMetric } from "@/lib/profiles";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "20종목 유니버스 — 이띠 DART 프로토타입",
};

/**
 * T10 — 20종목 카드 리스트. 새로 만드는 화면 로직은 없다: T4 정규화 결과(derived.json) + T7/T10
 * 프로필 엔진(lib/profiles.ts) + lib/stockView.ts(프로필별 확장 손익 병합)를 20종목에 반복
 * 적용하는 조립 화면이다. 서버 컴포넌트 — 정적 fs 읽기만 한다.
 *
 * 대표 지표는 프로필별로 다르게 "계산"된다(하드코딩된 종목별 분기 없음) — STANDARD는 매출액,
 * 금융 프로필은 PROFILE_CATALOG의 첫 stacked 지표(FIN_HOLDING/FIN_SECURITIES → 순이자손익,
 * FIN_INSURANCE → 보험손익)를 그대로 쓴다. 스파크라인은 컨트롤러 판단으로 생략했다(연간 3점뿐이라
 * 정보가치가 없다 — 브리프 §T10) — 대신 3개년 값을 소형 텍스트로 나열한다.
 */

const PROFILE_LABEL: Record<ProfileId, string> = {
  STANDARD: "표준",
  FIN_HOLDING: "금융·지주",
  FIN_BANK: "금융·은행",
  FIN_SECURITIES: "금융·증권",
  FIN_INSURANCE: "금융·보험",
};

const PROFILE_BADGE_CLASS: Record<ProfileId, string> = {
  STANDARD: styles.badgeStandard,
  FIN_HOLDING: styles.badgeFin,
  FIN_BANK: styles.badgeFin,
  FIN_SECURITIES: styles.badgeFin,
  FIN_INSURANCE: styles.badgeFin,
};

const YEARS = ["2023", "2024", "2025"] as const;

/** STANDARD는 매출액 고정(브리프 명시), 금융 프로필은 카탈로그의 첫 stacked 지표를 그대로 쓴다 — 지표 키를 프로필별로 하드코딩하지 않는다. */
function representativeMetric(profile: ProfileId): ProfileMetric | undefined {
  if (profile === "STANDARD") return findProfileMetric("STANDARD", "revenue");
  const stacked = PROFILE_CATALOG[profile].pnl.find((m) => m.chart === "stacked");
  return stacked ?? PROFILE_CATALOG[profile].pnl[0];
}

export default function HomePage() {
  const cards = UNIVERSE.map((row) => {
    const profileId = profileIdOf(row);
    const repMetric = representativeMetric(profileId);
    const yearViews = YEARS.map((year) => loadStockYearView(row, year));
    const coverageResolutions = yearViews.find((v) => v.year === "2024")!.resolutions;
    const coverage = summarizeCoverage(profileId, coverageResolutions);
    return { row, profileId, repMetric, yearViews, coverage };
  });

  const finCount = cards.filter((c) => c.profileId !== "STANDARD").length;
  const finAvgCoverage = Math.round((cards.filter((c) => c.profileId !== "STANDARD").reduce((s, c) => s + c.coverage.hit / c.coverage.total, 0) / finCount) * 100);
  const nonFinCards = cards.filter((c) => c.profileId === "STANDARD");
  const nonFinAvgCoverage = Math.round((nonFinCards.reduce((s, c) => s + c.coverage.hit / c.coverage.total, 0) / nonFinCards.length) * 100);

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>20종목 유니버스 (/)</h1>
      <p className={styles.lead}>
        각 카드는 DART 실측값만 표시한다 — 근거 없는 0은 없다. 커버리지 %는 프로필 카탈로그(lib/profiles.ts) 후보 대비 실제
        HIT 비율이다. 금융 {finCount}종목 평균 {finAvgCoverage}% &lt; 비금융 {nonFinCards.length}종목 평균 {nonFinAvgCoverage}% —
        원인은 하나가 아니라 둘이 겹친 결과다: ① 금융업 전용 안정성 지표(BIS·NPL·NCR·K-ICS)가 DART 표준 API에 아예 없는
        구조적 요인(금융 프로필에만 해당), ② 종목별로 특정 계정이 공시 자체에서 빠지는 결측(비금융도 예외가 아니다 —
        예: 카카오는 매출총이익 행이 없어 83%). 둘 다 정상 동작이다(카탈로그 조작 아님).
      </p>

      <div className={styles.grid}>
        {cards.map(({ row, profileId, repMetric, yearViews, coverage }) => {
          const coveragePct = Math.round((coverage.hit / coverage.total) * 100);
          return (
            <Link key={row.stockCode} href={`/stock/${row.stockCode}`} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.name}>{row.name}</span>
                <span className={`${styles.badge} ${PROFILE_BADGE_CLASS[profileId]}`}>{PROFILE_LABEL[profileId]}</span>
              </div>
              <div className={styles.meta}>
                <span className="mono">{row.stockCode}</span>
                {row.accMt !== "12" && <span className={styles.fyBadge}>결산 {row.accMt}월</span>}
              </div>

              <div className={styles.coverageRow}>
                <div className={styles.coverageTrack}>
                  <div className={styles.coverageFill} style={{ width: `${coveragePct}%` }} />
                </div>
                <span className={styles.coverageText}>
                  커버리지 {coveragePct}% ({coverage.hit}/{coverage.total})
                </span>
              </div>

              {repMetric && (
                <div className={styles.repMetric}>
                  <div className={styles.repLabel}>{repMetric.label}</div>
                  <div className={styles.repYears}>
                    {yearViews.map((yv) => {
                      const resolution = yv.resolutions[repMetric.key];
                      const state = resolveDisplay(profileId, repMetric.key, resolution);
                      const value = state === "OK" && resolution?.normalized != null ? (repMetric.unit === "KRW" ? toEok(resolution.normalized) : resolution.normalized) : undefined;
                      return (
                        <div key={yv.year} className={styles.repYear}>
                          <span className={styles.repYearLabel}>{yv.year}</span>
                          <MetricValue state={state} value={value} unit={repMetric.unit} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {row.note && <p className={styles.note}>{row.note}</p>}
            </Link>
          );
        })}
      </div>
    </main>
  );
}
