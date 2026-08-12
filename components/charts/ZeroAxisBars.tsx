import { formatComma, NULL_PLACEHOLDER } from "./chartUtils";

/**
 * ZeroAxisBars — 0 기준선 발산 막대 (목업 `.zbrow/.zbtop/.zbbot/.zline`, 화면 ④ "순이익").
 * 적자 종목처럼 음수가 나올 수 있는 지표용 — 양수는 기준선 위(`.zbtop`), 음수는 아래
 * (`.zbbot`)로 그린다. 절댓값 기준 공통 스케일. 서버 컴포넌트.
 *
 * v2 T3 확장: 학습가이드 `bars()` 참조 — 양수/음수 영역을 `.zbtop`(56px)/`.zbbot`(26px)로
 * 고정 분할해 손실 막대가 항상 기준선 아래 그려지도록 하고(승인 규칙 2), 음수 막대는
 * `--up`(적색) 계열로 표시해 이전의 청색(`#b9c7d8`) 배색을 교체했다(적자를 "하락" 색으로
 * 표현하던 배색 버그 수정). `provisional`(테두리 dashed + `--prov`)·`unit`(우상단 단위)·
 * `compactLabels`(라벨·값 폰트를 줄이는 컴팩트 모드) 3개 prop을 추가했다 — 전부 옵셔널이라
 * 기존 `bars: {label, value}[]` 단독 호출부(app/stock/[code]/page.tsx)는 그대로 동작한다.
 */

export type ZeroAxisBar = {
  label: string;
  /** null이면 근거 없는 0 대신 자리 표시만 한다. */
  value: number | null;
  /** 확정 전 잠정치(4Q 역산 등) — 막대 테두리 dashed + 주황(`--prov`)으로 구분. */
  provisional?: boolean;
};

export type ZeroAxisBarsProps = {
  bars: ZeroAxisBar[];
  /** 우상단에 표시할 단위/구간 라벨 (예: "억원 · 최근 5분기"). */
  unit?: string;
  /** true면 x축 라벨·값 폰트를 줄여 막대 수가 많을 때(8분기 이상 등) 겹침을 줄인다. */
  compactLabels?: boolean;
};

export default function ZeroAxisBars({ bars, unit, compactLabels }: ZeroAxisBarsProps) {
  const max = Math.max(1, ...bars.map((b) => (b.value === null ? 0 : Math.abs(b.value))));

  return (
    <div data-chart="zero-axis-bars">
      {unit && <div className="qb-unit">{unit}</div>}
      <div className={`zbrow${compactLabels ? " compact" : ""}`}>
        {bars.map((bar) => {
          const missing = bar.value === null;
          const negative = !missing && (bar.value as number) < 0;
          const heightPct = missing ? 0 : Math.round((Math.abs(bar.value as number) / max) * 100);
          return (
            <div className="zbcol" key={bar.label}>
              <div className="zbtop">
                {!missing && !negative && (
                  <div className={`zbf${bar.provisional ? " prov" : ""}`} style={{ height: `${heightPct}%` }}>
                    <span className={`qbv${bar.provisional ? " prov" : ""}`}>{formatComma(bar.value as number)}</span>
                  </div>
                )}
                {missing && (
                  <div className="zbf empty" style={{ height: "2px" }}>
                    <span className="qbv missing">{NULL_PLACEHOLDER}</span>
                  </div>
                )}
              </div>
              <div className="zline" />
              <div className="zbbot">
                {negative && (
                  <div className={`zbf${bar.provisional ? " prov" : ""}`} style={{ height: `${heightPct}%` }}>
                    <span className="qbv neg">{formatComma(bar.value as number)}</span>
                  </div>
                )}
              </div>
              <div className="qbx">
                {bar.label}
                {bar.provisional && <span className="pchip">잠정</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
