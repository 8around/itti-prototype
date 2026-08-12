import type { Metadata } from "next";

import CashFlowDiverging from "@/components/charts/CashFlowDiverging";
import GroupedBars from "@/components/charts/GroupedBars";
import LineChart from "@/components/charts/LineChart";
import PieChart from "@/components/charts/PieChart";
import PnlWaterfall from "@/components/charts/PnlWaterfall";
import QuarterBars from "@/components/charts/QuarterBars";
import StackedBar100 from "@/components/charts/StackedBar100";
import ZeroAxisBars from "@/components/charts/ZeroAxisBars";
import MetricValue from "@/components/MetricValue";
import type { DisplayState } from "@/lib/normalize/types";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "kitchen-sink — 차트 프리미티브",
};

/**
 * /kitchen-sink — T6 완료 판정용 데모 페이지.
 *
 * 여기서만 예외적으로 하드코딩을 허용한다(태스크 브리프 §8). 값은 전부
 * `docs/goals-in-2months/이띠_R1_배포앱_목업_6.html`의 실제 화면에서 그대로 가져왔고,
 * 각 카드 캡션에 원본 화면 번호를 남겼다. 실데이터 연결은 T7(프로필 엔진) 이후.
 *
 * 전부 서버 컴포넌트 조합 — 이 페이지를 포함해 트리 전체에 "use client"가 없다.
 */
export default function KitchenSinkPage() {
  const metricStates: { state: DisplayState; label: string; render: React.ReactNode }[] = [
    {
      state: "OK",
      label: "OK",
      render: <MetricValue state="OK" value={1234} unit="KRW" basis="연결" />,
    },
    {
      state: "ZERO_BY_FACT",
      label: "ZERO_BY_FACT",
      render: <MetricValue state="ZERO_BY_FACT" note="무배당 확인" tier="T1" />,
    },
    {
      state: "MISSING",
      label: "MISSING",
      render: <MetricValue state="MISSING" />,
    },
    {
      state: "NA_NEGATIVE_BASE",
      label: "NA_NEGATIVE_BASE",
      render: <MetricValue state="NA_NEGATIVE_BASE" note="분모 음수" />,
    },
    {
      state: "NOT_IN_PROFILE",
      label: "NOT_IN_PROFILE",
      render: <MetricValue state="NOT_IN_PROFILE" note="금융 프로필" />,
    },
    {
      state: "SOURCE_NOT_AVAILABLE",
      label: "SOURCE_NOT_AVAILABLE",
      render: <MetricValue state="SOURCE_NOT_AVAILABLE" note="DART 미제공" />,
    },
  ];

  return (
    <main className={styles.page}>
      <div>
        <div className={styles.title}>차트 프리미티브 8종 + MetricValue</div>
        <p className={styles.lead}>
          목업 화면의 CSS/SVG 프리미티브를 그대로 이식한 서버 컴포넌트 데모. 값은 전부 목업 원본 화면의 하드코딩된
          숫자를 그대로 인용했다(T6 완료 판정 §8 예외). 트리 전체에 클라이언트 JS가 0바이트다.
        </p>
      </div>

      <section className={styles.grid}>
        <div className={styles.demo}>
          <div className={styles.demoTitle}>PnlWaterfall</div>
          <div className={styles.demoRef}>목업 화면 ⑥ 손익 구조 · 24.3Q · 억원</div>
          <PnlWaterfall
            rows={[
              { label: "매출", value: 4182, ratioPct: 100 },
              { label: "매출총이익", value: 1254, ratioPct: 30.0 },
              { label: "영업이익", value: 512, ratioPct: 12.2 },
              { label: "순이익", value: 388, ratioPct: 9.3 },
            ]}
          />
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>QuarterBars</div>
          <div className={styles.demoRef}>목업 화면 ③ 재무 메인보드 · 매출 5분기</div>
          <QuarterBars
            unit="억원 · 최근 5분기"
            bars={[
              { label: "23.4Q", value: 3720 },
              { label: "24.1Q", value: 3610 },
              { label: "24.2Q", value: 3940 },
              { label: "24.3Q", value: 4182 },
              { label: "24.4Q", value: 4690, provisional: true },
              { label: "25.1Q", value: null },
            ]}
          />
          <div className={styles.demoNote}>맨 끝은 잠정치(주황 점선), 25.1Q는 미확보 자리 표시(회색) 데모.</div>
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>ZeroAxisBars</div>
          <div className={styles.demoRef}>목업 화면 ④ 순이익 · 억원 · 지배주주</div>
          <ZeroAxisBars
            bars={[
              { label: "23.4Q", value: 360 },
              { label: "24.1Q", value: 322 },
              { label: "24.2Q", value: -286 },
              { label: "24.3Q", value: 365 },
              { label: "24.4Q", value: 388 },
            ]}
          />
          <div className={styles.demoNote}>
            24.2Q(-286)는 적자 데모 — 값은 목업 화면 ⑩ 제노메드 「영업손익 -286억(적자)」에서 인용해 0 기준선 아래
            렌더링을 검증했다.
          </div>
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>GroupedBars</div>
          <div className={styles.demoRef}>목업 화면 ③·④ 인용 · 매출 vs 영업이익 · 억원</div>
          <GroupedBars
            seriesLabels={["매출", "영업이익"]}
            groups={[
              { label: "23.4Q", a: 3720, b: 452 },
              { label: "24.1Q", a: 3610, b: 430 },
              { label: "24.2Q", a: 3940, b: 486 },
              { label: "24.3Q", a: 4182, b: 512 },
              { label: "24.4Q", a: 4690, b: 631 },
            ]}
          />
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>CashFlowDiverging</div>
          <div className={styles.demoRef}>목업 화면 ⑥ 현금흐름 · 24.3Q · 억원</div>
          <CashFlowDiverging
            rows={[
              { label: "영업", value: 612 },
              { label: "투자", value: -470 },
              { label: "재무", value: 188 },
              { label: "FCF", value: 142 },
            ]}
          />
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>LineChart</div>
          <div className={styles.demoRef}>목업 화면 ④ EPS · 원 · 지배주주 기준</div>
          <LineChart
            points={[
              { label: "23.4Q", value: 1150 },
              { label: "24.1Q", value: 1030 },
              { label: "24.2Q", value: 1168 },
              { label: "24.3Q", value: 1240 },
              { label: "24.4Q", value: 1508, provisional: true },
            ]}
          />
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>PieChart</div>
          <div className={styles.demoRef}>목업 화면 ③ 사업부문별 매출 비중 · 24.09</div>
          <PieChart
            slices={[
              { label: "양극재", value: 68.4 },
              { label: "장비", value: 24.9 },
              { label: "기타", value: 6.7 },
            ]}
          />
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>StackedBar100</div>
          <div className={styles.demoRef}>목업 화면 ⑦ 재무상태 · 자산은 무엇으로 이뤄져 있나 · 억원</div>
          <StackedBar100
            segments={[
              { label: "현금성자산", value: 1180 },
              { label: "매출채권", value: 1420 },
              { label: "재고자산", value: 880 },
              { label: "유형자산", value: 3900 },
              { label: "기타", value: 820 },
            ]}
          />
        </div>
      </section>

      <div>
        <div className={styles.title}>MetricValue — displayState 6종</div>
        <p className={styles.lead}>플랜 §7 정본 그대로. 이 6개 텍스트가 전부 그려지는지가 T6 완료 판정 기준이다.</p>
      </div>

      <section className={styles.mvGrid}>
        {metricStates.map((m) => (
          <div className={styles.mvCard} key={m.state}>
            <div className={styles.mvState}>{m.label}</div>
            {m.render}
          </div>
        ))}
      </section>
    </main>
  );
}
