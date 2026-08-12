import { chartDigits, formatChartValue, NULL_PLACEHOLDER } from "./chartUtils";

/**
 * StackedBars — **기간별 누적 막대**. 7셋 SET2(재무상태) 전용.
 *
 * 클라이언트 합의: *"재무상태 (자산=부채+자본) → 누적 막대"*. 기존 `PieChart`(한 시점의 구성비)를
 * 대체한다 — 파이는 한 해만 보여주지만 누적 막대는 **구성비와 증감 추이를 동시에** 보여준다.
 *
 * 자산 = 부채 + 자본은 회계등식이라 **항상 정확히 맞아떨어진다**. 그래서 한 막대를 두 색으로
 * 쌓으면 막대 전체 높이가 자산총계가 되고, 색 비율이 곧 재무구조가 된다.
 * (학습가이드 SET2: "아래 초록=자본, 위 빨강=부채")
 *
 * 결측 처리: 부채·자본 중 하나라도 없는 기간은 막대를 그리지 않고 자리만 남긴다. 한쪽만 그리면
 * 막대 높이가 자산총계로 오독되기 때문이다.
 *
 * 서버 컴포넌트.
 */

export type StackedBarPeriod = {
  label: string;
  /** 아래 세그먼트(자본). null이면 이 기간은 막대를 그리지 않는다. */
  equity: number | null;
  /** 위 세그먼트(부채). */
  liabilities: number | null;
};

export type StackedBarsProps = {
  periods: StackedBarPeriod[];
  unit: string;
};

export default function StackedBars({ periods, unit }: StackedBarsProps) {
  const totals = periods.map((p) => (p.equity === null || p.liabilities === null ? null : p.equity + p.liabilities));
  const max = Math.max(1, ...totals.map((t) => (t === null ? 0 : Math.abs(t))));
  const digits = chartDigits(totals);

  return (
    <div data-chart="stacked-bars">
      <div className="qb-unit">{unit}</div>
      <div className="qbrow">
        {periods.map((p, i) => {
          const total = totals[i];
          if (total === null) {
            return (
              <div className="qbcol" key={p.label}>
                <div className="qbtrack">
                  <div className="qbfill empty" style={{ height: "2px" }}>
                    <span className="qbv missing">{NULL_PLACEHOLDER}</span>
                  </div>
                </div>
                <div className="qbx missing">{p.label}</div>
              </div>
            );
          }
          const totalPct = (Math.abs(total) / max) * 100;
          // 세그먼트 높이는 막대 전체(totalPct) 안에서의 비율 — 두 값을 더하면 정확히 100%가 된다.
          const equityShare = (Math.abs(p.equity as number) / Math.abs(total)) * 100;
          return (
            <div className="qbcol" key={p.label}>
              <div className="qbtrack">
                <div className="sbstack" style={{ height: `${totalPct}%` }}>
                  {/* 총계 라벨은 막대 위로 삐져나오므로 클리핑되는 .sbsegs 밖에 둔다. */}
                  <span className="qbv">{formatChartValue(total, digits)}</span>
                  <div className="sbsegs">
                    <div className="sbseg sbliab" style={{ height: `${100 - equityShare}%` }} />
                    <div className="sbseg sbequity" style={{ height: `${equityShare}%` }} />
                  </div>
                </div>
              </div>
              <div className="qbx">{p.label}</div>
            </div>
          );
        })}
      </div>
      <div className="sblegend">
        <span>
          <i className="sbchip sbequity" /> 자본(내 돈)
        </span>
        <span>
          <i className="sbchip sbliab" /> 부채(남의 돈)
        </span>
        <span className="sblegend-note">막대 전체 높이 = 자산총계 (자산 = 부채 + 자본)</span>
      </div>
    </div>
  );
}
