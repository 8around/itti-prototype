import type { Metadata } from "next";

import LineChart from "@/components/charts/LineChart";
import OverlaidBars from "@/components/charts/OverlaidBars";
import PieChart from "@/components/charts/PieChart";
import PnlWaterfall from "@/components/charts/PnlWaterfall";
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
 * /kitchen-sink — 차트 프리미티브 + `DisplayState` 데모 페이지(V3 전면 갱신).
 *
 * 여기서만 예외적으로 하드코딩을 허용한다(원 브리프 §8 예외, V0~V3 전부 유지). 값은 목업/
 * 학습가이드 원본 또는 실 데이터로 만들 수 없는 경계 상태를 보이기 위한 구성값이다.
 *
 * V0(색·토큰)→V1(막대 3종: ZeroAxisBars·StackedBarsAbs·OverlaidBars)→V2(꺾은선·부호막대:
 * LineChart·SignedGroupedBars)→V3(잔여 차트: PnlWaterfall·StackedBar100·PieChart + 정리)로
 * 차트 전종이 Recharts로 재작성됐다 — `GroupedBars`/`QuarterBars`/`CashFlowDiverging`은 종목
 * 페이지 미사용이 확인되어 V3에서 삭제했다(각각 `ZeroAxisBars`/`SignedGroupedBars`로 완전
 * 대체됨, task-V3-report.md 근거).
 *
 * 차트 8종은 전부 `"use client"`(Recharts SVG 렌더가 필요)라 이 트리는 클라이언트 JS 0바이트가
 * 아니다 — `MetricValue`/페이지 레이아웃만 서버 컴포넌트로 남아 있다.
 *
 * 아래는 두 그룹으로 나뉜다: (1) 각 차트의 전형적인 사용례, (2) 실 데이터 20종목이 만들지 못하는
 * **경계 상태**(전 세그먼트 결측·전 구간 전환·음수만·6개 이상 세그먼트 등) — V3 브리프가 명시한
 * 킷친싱크의 존재 이유다.
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
    // V3 — 9종 완성(브리프 명시). 성장률(QoQ/YoY) 전용 상태 3종 — MetricValue.renderText()가
    // 이미 처리하고 있었지만(components/MetricValue.tsx KNOWN_FACT_STATES) 킷친싱크 그리드에는
    // 6종만 있었다.
    {
      state: "TURN_TO_PROFIT",
      label: "TURN_TO_PROFIT",
      render: <MetricValue state="TURN_TO_PROFIT" note="QoQ/YoY" />,
    },
    {
      state: "TURN_TO_LOSS",
      label: "TURN_TO_LOSS",
      render: <MetricValue state="TURN_TO_LOSS" note="QoQ/YoY" />,
    },
    {
      state: "LOSS_CONTINUED",
      label: "LOSS_CONTINUED",
      render: <MetricValue state="LOSS_CONTINUED" note="QoQ/YoY" />,
    },
  ];

  return (
    <main className={styles.page}>
      <div>
        <div className={styles.title}>차트 프리미티브 8종 — 정상 케이스</div>
        <p className={styles.lead}>
          종목 페이지가 실제로 쓰는 8종(PnlWaterfall·ZeroAxisBars·StackedBar100·StackedBarsAbs·OverlaidBars·SignedGroupedBars·LineChart) +
          킷친싱크 전용으로 남은 PieChart. 전형적인 입력값으로 각 차트의 기본 동작을 확인한다.
        </p>
      </div>

      <section className={styles.grid}>
        <div className={styles.demo}>
          <div className={styles.demoTitle}>PnlWaterfall</div>
          <div className={styles.demoRef}>종목 페이지 ②손익(STANDARD 프로필) 인용 · FY2025 · 억원</div>
          <PnlWaterfall
            rows={[
              { label: "매출액", value: 4182, ratioPct: 100 },
              { label: "매출총이익", value: 1254, ratioPct: 30.0 },
              { label: "영업이익", value: 512, ratioPct: 12.2 },
              { label: "당기순이익(지배주주)", value: 388, ratioPct: 9.3 },
            ]}
          />
          <div className={styles.demoNote}>
            매출=100% 기준 4단계 비율. 값·비율 텍스트가 막대 길이와 무관하게 같은 x에서 시작하는지(표처럼 스캔 가능한지) 확인하는 데모.
          </div>
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
            24.2Q(-286)는 적자 데모 — 값은 목업 화면 ⑩ 제노메드 「영업손익 -286억(적자)」에서 인용해 0 기준선 아래 렌더링을 검증했다.
          </div>
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>StackedBar100</div>
          <div className={styles.demoRef}>종목 페이지 ②손익(금융 프로필) 인용 · 순이자손익 등 순액 3종 · 억원</div>
          <StackedBar100
            segments={[
              { label: "순이자손익", value: 2180 },
              { label: "순수수료손익", value: 640 },
              { label: "보험서비스결과", value: 380 },
            ]}
          />
          <div className={styles.demoNote}>가장 넓은 세그먼트(순이자손익)는 막대 안에 퍼센트가 보이는지, 좁은 세그먼트는 범례로만 보이는지 확인하는 데모.</div>
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
          <div className={styles.demoNote}>값이 전부 100%를 크게 밑돌아도(42~50%) 100% 기준선이 도메인에 강제 포함되어 화면 밖으로 밀려나지 않는지 확인하는 데모.</div>
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
          <div className={styles.demoNote}>1Q26은 직전 분기(4Q25)가 적자라 QoQ %가 무의미 — 값 대신 상태 칩을 표시하고 선이 끊기는지 확인하는 데모.</div>
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>StackedBarsAbs</div>
          <div className={styles.demoRef}>학습가이드 c2 자산 구성 · stacked([[1150,750],[1180,780],[1200,800]]) 그대로 인용 · 억원</div>
          <StackedBarsAbs
            bars={[
              {
                label: "2024",
                segments: [
                  { label: "자본", value: 1150, color: "var(--green)" },
                  { label: "부채", value: 750, color: "var(--up)", opacity: 0.55 },
                ],
              },
              {
                label: "2025",
                segments: [
                  { label: "자본", value: 1180, color: "var(--green)" },
                  { label: "부채", value: 780, color: "var(--up)", opacity: 0.55 },
                ],
              },
              {
                label: "최근",
                segments: [
                  { label: "자본", value: 1200, color: "var(--green)" },
                  { label: "부채", value: 800, color: "var(--up)", opacity: 0.55 },
                ],
              },
            ]}
          />
          <div className={styles.demoNote}>
            StackedBar100(100% 정규화)과 달리 막대 높이 자체가 합계(자산)라서 기간이 갈수록 막대가 커지는 절대 크기 변화가 그대로 보인다 — 아래 자본, 위 부채.
          </div>
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>OverlaidBars</div>
          <div className={styles.demoRef}>학습가이드 c6 EPS+배당 겹침 epsDiv() 문법 인용 · 2023·2024는 무배당/데이터없음 대비 데모용 구성 · 원</div>
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
            2023(ZERO_BY_FACT)은 &quot;무배당&quot; 칩, 2024(inner: null)는 &quot;—&quot;(데이터 없음) 칩으로 나란히 — 배당 0원과 데이터 없음을 구분하는 승인 규칙 4 검증용.
          </div>
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>SignedGroupedBars</div>
          <div className={styles.demoRef}>학습가이드 c3 현금흐름(24.3Q, [250,-100,-60]) 인용 + 24.4Q는 다기간 데모용 구성값 · 억원</div>
          <SignedGroupedBars
            seriesLabels={["영업", "투자", "재무"]}
            groups={[
              { label: "24.3Q", values: [250, -100, -60] },
              { label: "24.4Q", values: [310, -150, 40] },
            ]}
          />
          <div className={styles.demoNote}>0축 기준으로 3계열이 각각 위(+)/아래(−)로 갈리는지, 24.4Q 재무(+40)처럼 계열별로 부호가 바뀌는 경우도 정상 렌더되는지 확인하는 데모.</div>
        </div>
      </section>

      <div>
        <div className={styles.title}>경계 상태 데모 — 실 데이터 20종목이 만들지 못하는 케이스</div>
        <p className={styles.lead}>
          전 세그먼트 결측·전 구간 상태전환·음수만·6개 이상 세그먼트 등은 현재 SSG 대상 20종목 중 어느 것도 만들지 않는 조합이다 — 여기서 하드코딩으로
          렌더해 코드 리뷰만으로는 못 보는 경로를 눈으로 확인한다(V3 브리프 명시 요구).
        </p>
      </div>

      <section className={styles.grid}>
        <div className={styles.demo}>
          <div className={styles.demoTitle}>StackedBarsAbs — 전 세그먼트 결측</div>
          <div className={styles.demoRef}>V1 이월 항목 — 코드 리뷰로만 확인하고 육안 검증 못 한 경로(20종목 중 해당 케이스 없음)</div>
          <StackedBarsAbs
            bars={[
              {
                label: "2023",
                segments: [
                  { label: "자본", value: null },
                  { label: "부채", value: null },
                ],
              },
              {
                label: "2024",
                segments: [
                  { label: "자본", value: null },
                  { label: "부채", value: null },
                ],
              },
              {
                label: "2025",
                segments: [
                  { label: "자본", value: null },
                  { label: "부채", value: null },
                ],
              },
            ]}
          />
          <div className={styles.demoNote}>3개 연도 전부 세그먼트가 null — 스택 막대 대신 결측 마커(가로선) + &quot;—&quot;가 3곳 다 뜨는지, 근거 없는 0으로 그려지지 않는지 확인.</div>
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>StackedBar100 — 6세그먼트(팔레트 순환 재사용)</div>
          <div className={styles.demoRef}>V3 — CATEGORY_PALETTE 5색을 넘는 순번의 hue 재사용 검증</div>
          <StackedBar100
            segments={[
              { label: "순이자손익", value: 1800 },
              { label: "순수수료손익", value: 520 },
              { label: "보험서비스결과", value: 340 },
              { label: "투자손익", value: 260 },
              { label: "기타영업손익", value: 180 },
              { label: "일회성손익", value: 90 },
            ]}
          />
          <div className={styles.demoNote}>
            6번째 세그먼트(일회성손익)는 1번째(순이자손익)와 같은 hue를 재사용하되 옅은 채움(fillOpacity 감소)으로 그려져 서로 구별되는지 확인.
          </div>
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>StackedBar100 — 전 세그먼트 결측</div>
          <div className={styles.demoRef}>V3 — global-constraints.md §1 &quot;결측을 0으로 그리지 말 것&quot; 검증</div>
          <StackedBar100
            segments={[
              { label: "순이자손익", value: null },
              { label: "순수수료손익", value: null },
              { label: "보험서비스결과", value: null },
            ]}
          />
          <div className={styles.demoNote}>3종 전부 결측 — 스택 막대 대신 회색 자리 표시 + 안내 문구가 뜨는지(0-division 없이) 확인.</div>
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>PnlWaterfall — 적자 단계 + 결측</div>
          <div className={styles.demoRef}>V3 — 매출 대비 음수 비율(영업손실) + 마지막 단계 결측 검증</div>
          <PnlWaterfall
            rows={[
              { label: "매출액", value: 1200, ratioPct: 100 },
              { label: "매출총이익", value: 180, ratioPct: 15.0 },
              { label: "영업이익", value: -320, ratioPct: -26.7 },
              { label: "당기순이익(지배주주)", value: null, ratioPct: null },
            ]}
          />
          <div className={styles.demoNote}>영업이익(-320, -26.7%)이 0 기준선 왼쪽(적색)으로 뻗는지, 마지막 행(결측)은 근거 없는 0 대신 자리 표시만 뜨는지 확인.</div>
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>ZeroAxisBars — 전 구간 적자</div>
          <div className={styles.demoRef}>V3 — 양수 기준점 없이 전부 음수인 도메인 검증</div>
          <ZeroAxisBars
            unit="억원 · 최근 4분기"
            bars={[
              { label: "1Q25", value: -120 },
              { label: "2Q25", value: -95 },
              { label: "3Q25", value: -140 },
              { label: "4Q25", value: -80 },
            ]}
          />
          <div className={styles.demoNote}>양수 막대가 하나도 없어도 도메인 상단이 0에 고정되고(niceDomain 대신 padDomain의 0 포함 규칙), 4개 막대 전부 기준선 아래로 대칭 렌더되는지 확인.</div>
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>PieChart — 결측 슬라이스 + 3% 미만 슬라이스</div>
          <div className={styles.demoRef}>V3 — LABEL_MIN_PERCENT(3%) 경계 + 결측 슬라이스 검증</div>
          <PieChart
            slices={[
              { label: "A사업부", value: 70 },
              { label: "B사업부", value: 24 },
              { label: "C사업부", value: 4 },
              { label: "D사업부", value: 2 },
              { label: "E사업부(비공개)", value: null },
            ]}
          />
          <div className={styles.demoNote}>D사업부(2%, 임계값 3% 미만)는 슬라이스 색은 보이지만 바깥 라벨이 생략되는지(라벨 겹침 방지), E사업부(null)는 범례에 &quot;—&quot;로만 남는지 확인.</div>
        </div>

        <div className={styles.demo}>
          <div className={styles.demoTitle}>LineChart — 전 구간 상태전환(그릴 값 0개)</div>
          <div className={styles.demoRef}>components/charts/LineChart.tsx &quot;개선점 B&quot; — 전 포인트가 state뿐이라 선·점이 하나도 없는 경로</div>
          <LineChart
            unit="%"
            sign
            baseline={{ value: 0, label: "0% 기준선(그릴 값이 0개여도 유지)" }}
            points={[
              { label: "1Q25", state: "적자지속" },
              { label: "2Q25", state: "적자지속" },
              { label: "3Q25", state: "적자지속" },
              { label: "4Q25", state: "적자지속" },
            ]}
          />
          <div className={styles.demoNote}>4분기 전부 QoQ 분모가 적자라 %가 무의미 — 선·점이 전혀 없어도 0% 기준선은 유지되고, 그릴 값이 없다는 음소거 안내 문구가 뜨는지 확인.</div>
        </div>
      </section>

      <div>
        <div className={styles.title}>MetricValue — displayState 9종</div>
        <p className={styles.lead}>
          플랜 §7 정본 6종 + 성장률(QoQ/YoY) 전환 3종(TURN_TO_PROFIT/TURN_TO_LOSS/LOSS_CONTINUED, v2 T2 추가). 이 9개 텍스트가 전부 그려지는지가
          V3 완료 판정 기준 중 하나다.
        </p>
      </div>

      <section className={styles.mvGrid}>
        {metricStates.map((m) => (
          <div className={styles.mvCard} key={m.state}>
            <div className={styles.mvState}>{m.label}</div>
            {m.render}
          </div>
        ))}
        {/* 리뷰 픽스: unit:"X"의 "배" 접미사 렌더 증거. 14.9배는 목업 화면 ②⑨(한빛소재 PER)의
            실제 하드코딩 값 — 9상태 그리드 밖이라 state는 OK 재사용, 카드 라벨로만 구분한다. */}
        <div className={styles.mvCard} key="OK-unit-X">
          <div className={styles.mvState}>OK (unit: X)</div>
          <MetricValue state="OK" value={14.9} unit="X" basis="연결" />
        </div>
      </section>
    </main>
  );
}
