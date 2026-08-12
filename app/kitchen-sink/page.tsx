import type { Metadata } from "next";

import CashFlowDiverging from "@/components/charts/CashFlowDiverging";
import GroupedBars from "@/components/charts/GroupedBars";
import LineChart from "@/components/charts/LineChart";
import OverlaidBars from "@/components/charts/OverlaidBars";
import PieChart from "@/components/charts/PieChart";
import PnlWaterfall from "@/components/charts/PnlWaterfall";
import QuarterBars from "@/components/charts/QuarterBars";
import SignedGroupedBars from "@/components/charts/SignedGroupedBars";
import StackedBar100 from "@/components/charts/StackedBar100";
import StackedBarsAbs from "@/components/charts/StackedBarsAbs";
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
        <div className={styles.title}>차트 프리미티브 11종 + MetricValue</div>
        <p className={styles.lead}>
          목업 화면의 CSS/SVG 프리미티브를 그대로 이식한 서버 컴포넌트 데모(8종, T6) + v2 T3에서 확장한
          ZeroAxisBars·LineChart와 신설한 StackedBarsAbs·OverlaidBars·SignedGroupedBars(3종). 값은 목업/학습가이드
          원본의 하드코딩된 숫자를 그대로 인용했다(T6 완료 판정 §8 예외 — 킷친싱크 한정). 트리 전체에 클라이언트
          JS가 0바이트다.
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
        <div className={styles.title}>v2 T3 — 차트 확장 5종 데모</div>
        <p className={styles.lead}>
          클라이언트 승인 차트 문법(슬랙 #pj-외부-이띠, 2026-08-12)의 근거인{" "}
          <code>이띠_데이터항목_학습가이드.html</code> 하단 <code>&lt;script&gt;</code>의 <code>bars()</code>/
          <code>stacked()</code>/<code>line()</code>/<code>epsDiv()</code> 예시 수치를 그대로 인용해 검증한다.
        </p>
      </div>

      <section className={styles.grid}>
        <div className={styles.demo}>
          <div className={styles.demoTitle}>ZeroAxisBars (확장 — provisional·unit·compactLabels)</div>
          <div className={styles.demoRef}>학습가이드 c1a 영업이익 · bars([160,175,168,-30,200]) 그대로 인용</div>
          <ZeroAxisBars
            unit="억원 · 최근 5분기"
            compactLabels
            bars={[
              { label: "1Q25", value: 160 },
              { label: "2Q25", value: 175 },
              { label: "3Q25", value: 168 },
              { label: "4Q25", value: -30 },
              { label: "1Q26", value: 200, provisional: true },
            ]}
          />
          <div className={styles.demoNote}>
            4Q25(-30)이 기준선 아래 적색으로 그려지는지(승인 규칙 2), 1Q26이 점선 테두리+&quot;잠정&quot; 칩으로
            구분되는지(승인 규칙 3) 확인하는 데모.
          </div>
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>LineChart (확장 — baseline 기준선)</div>
          <div className={styles.demoRef}>학습가이드 c5 부채비율 threshold 문법 인용 · 값은 도메인 강제 포함 검증용으로 낮게 구성</div>
          <LineChart
            color="var(--chart-4)"
            unit="%"
            baseline={{ value: 100, label: "빨간 점선 = 부채비율 100% 기준(도메인에 강제 포함)" }}
            points={[
              { label: "1Q25", value: 42 },
              { label: "2Q25", value: 45 },
              { label: "3Q25", value: 48 },
              { label: "4Q25", value: 44 },
              { label: "1Q26", value: 50 },
            ]}
          />
          <div className={styles.demoNote}>
            값이 전부 100%를 크게 밑돌아도(42~50%) 100% 기준선이 도메인에 강제 포함되어 화면 밖으로 밀려나지
            않는지 확인하는 데모.
          </div>
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>LineChart (확장 — state 칩)</div>
          <div className={styles.demoRef}>학습가이드 c1b 영업이익 QoQ · line([9,-4,-118], {"{sign:true}"}) 인용 + 1Q26 흑자전환 칩 추가</div>
          <LineChart
            unit="%"
            sign
            points={[
              { label: "2Q25", value: 9 },
              { label: "3Q25", value: -4 },
              { label: "4Q25", value: -118 },
              { label: "1Q26", state: "흑자전환" },
            ]}
          />
          <div className={styles.demoNote}>
            1Q26은 직전 분기(4Q25)가 적자라 QoQ %가 무의미 — 값 대신 상태 칩을 표시하고 선이 끊기는지 확인하는
            데모(학습가이드 c1b 캡션과 동일한 시나리오).
          </div>
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>StackedBarsAbs (신설)</div>
          <div className={styles.demoRef}>학습가이드 c2 자산 구성 · stacked([[1150,750],[1180,780],[1200,800]]) 그대로 인용 · 억원</div>
          <StackedBarsAbs
            bars={[
              {
                label: "2024",
                segments: [
                  { label: "자본", value: 1150 },
                  { label: "부채", value: 750 },
                ],
              },
              {
                label: "2025",
                segments: [
                  { label: "자본", value: 1180 },
                  { label: "부채", value: 780 },
                ],
              },
              {
                label: "최근",
                segments: [
                  { label: "자본", value: 1200 },
                  { label: "부채", value: 800 },
                ],
              },
            ]}
          />
          <div className={styles.demoNote}>
            StackedBar100(100% 정규화)과 달리 막대 높이 자체가 합계(자산)라서 기간이 갈수록 막대가 커지는 절대
            크기 변화가 그대로 보인다 — 아래 자본, 위 부채.
          </div>
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>OverlaidBars (신설)</div>
          <div className={styles.demoRef}>
            학습가이드 c6 EPS+배당 겹침 epsDiv() 문법 인용 · 2023·2024는 무배당/데이터없음 대비 데모용 구성 · 원
          </div>
          <OverlaidBars
            outerLabel="EPS"
            innerLabel="DPS"
            bars={[
              { label: "2022", outer: 3800, inner: 600 },
              { label: "2023", outer: 4200, inner: 0, innerState: "ZERO_BY_FACT" },
              { label: "2024", outer: 4600, inner: null },
              { label: "2025", outer: 5100, inner: 1100 },
            ]}
          />
          <div className={styles.demoNote}>
            2023(ZERO_BY_FACT)은 &quot;무배당&quot; 칩, 2024(inner: null)는 &quot;—&quot;(데이터 없음) 칩으로
            나란히 — 배당 0원과 데이터 없음을 구분하는 승인 규칙 4 검증용.
          </div>
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>SignedGroupedBars (신설)</div>
          <div className={styles.demoRef}>학습가이드 c3 현금흐름(24.3Q, [250,-100,-60]) 인용 + 24.4Q는 다기간 데모용 구성값 · 억원</div>
          <SignedGroupedBars
            seriesLabels={["영업", "투자", "재무"]}
            groups={[
              { label: "24.3Q", values: [250, -100, -60] },
              { label: "24.4Q", values: [310, -150, 40] },
            ]}
          />
          <div className={styles.demoNote}>
            0축 기준으로 3계열이 각각 위(+)/아래(−)로 갈리는지, 24.4Q 재무(+40)처럼 계열별로 부호가 바뀌는
            경우도 정상 렌더되는지 확인하는 데모.
          </div>
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
        {/* 리뷰 픽스: unit:"X"의 "배" 접미사 렌더 증거. 14.9배는 목업 화면 ②⑨(한빛소재 PER)의
            실제 하드코딩 값 — 6상태 그리드 밖이라 state는 OK 재사용, 카드 라벨로만 구분한다. */}
        <div className={styles.mvCard} key="OK-unit-X">
          <div className={styles.mvState}>OK (unit: X)</div>
          <MetricValue state="OK" value={14.9} unit="X" basis="연결" />
        </div>
      </section>
    </main>
  );
}
