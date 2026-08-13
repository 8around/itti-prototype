"use client";

import type { ReactElement } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { BarShapeProps } from "recharts";

import { AXIS_TEXT, BAR_MAX_SIZE, GREEN, GRID_LINE, LABEL_FONT_SIZE_MIN, LOSS, PAPER } from "./chartTheme";
import { formatComma, NULL_PLACEHOLDER } from "./chartUtils";
import { MissingMarker, normalizeRect, padDomain, pixelForValue, StateChip, ValueLabel, zeroInclusiveDomain } from "./rechartsPrimitives";
import type { DisplayState } from "@/lib/normalize/types";

/**
 * OverlaidBars — EPS(바깥) + DPS(안쪽) 겹침 막대 (Recharts 재작성, V1). 학습가이드 `epsDiv()`
 * 참조, SET6 "EPS 추이 — 진한 부분 = 그중 배당으로 준 몫". 흑자 연도에는 같은 x·같은 바닥에서
 * 바깥 막대(EPS, 연한 채움) 위에 안쪽 막대(DPS, 진한 채움)를 겹쳐 그린다 — 두 막대 다 같은 x
 * 폭을 나눠 갖는 "그룹형"이 아니라 진짜 겹침(불릿 차트류)이라, Recharts에 내장된 그룹/스택
 * 모드로는 표현할 수 없다. 대신 `<Bar dataKey="outerForScale">` 하나에 `background`를 켜고
 * 커스텀 `shape`에서 EPS·DPS 사각형을 전부 직접 그린다.
 *
 * **패턴 노트(V2·V3용)** — 하나의 `Bar shape` 콜백 안에서 "이 막대에 바인딩된 값"이 아닌 다른
 * 값(여기서는 DPS)의 픽셀 좌표가 필요할 때: `Bar background`를 켜면 shape가 받는 `background`
 * 인자가 `{x, y, height}`로 **그 카테고리의 전체 플롯 영역**(도메인 최댓값~최솟값 전체 픽셀 범위)을
 * 알려준다. 이 사각형과 알고 있는 도메인 `[min,max]`를 결합하면(`pixelForValue`) 임의 값을
 * 같은 축으로 변환할 수 있다 — Recharts가 스케일 함수 자체를 shape props로 내려주지 않기 때문에
 * 필요한 우회로다(recharts `Bar.js`의 `background = {x, y: offset.top, width, height:
 * offset.height}` 계산과 대응, `node_modules/recharts/es6/cartesian/Bar.js`로 실제 확인함).
 *
 * 승인 규칙 4(배당 0원과 데이터 없음 구분)를 위해 `innerState`로 두 상태를 명시적으로 나눈다:
 * - `innerState === "ZERO_BY_FACT"` → 무배당이 사실로 확인됨 → 안쪽 막대 높이 0 + "무배당" 칩
 * - `inner === null`(innerState 미지정) → 못 읽음 → "—" 칩
 *
 * 적자 연도의 DPS는 EPS 막대와 겹치지 않고 기준선 위에 따로 그린다(`innerSolo`) — "EPS 중 배당으로
 * 준 몫"이라는 범례가 손실 막대 안에서는 성립하지 않기 때문이다.
 */

export type OverlaidBar = {
  label: string;
  /** 바깥 막대 값(예: EPS). null이면 근거 없는 0 대신 자리 표시만 한다. */
  outer: number | null;
  /** 안쪽 막대 값(예: DPS). */
  inner: number | null;
  /** "ZERO_BY_FACT"면 inner 값과 무관하게 높이 0 + "무배당" 칩으로 그린다. */
  innerState?: DisplayState;
};

export type OverlaidBarsProps = {
  bars: OverlaidBar[];
  /** 바깥 막대 범례 라벨 (예: "EPS"). */
  outerLabel: string;
  /** 안쪽 막대 범례 라벨 (예: "DPS"). */
  innerLabel: string;
};

type Row = {
  label: string;
  outerForScale: number;
  outerValue: number | null;
  outerMissing: boolean;
  outerNegative: boolean;
  innerRaw: number | null;
  zeroByFact: boolean;
  innerMissing: boolean;
  innerSolo: boolean;
};

function drawOverlayBar(props: BarShapeProps, domain: [number, number]): ReactElement | null {
  const { x, width, background } = props;
  if (!background || background.y === null) return null;
  const plotRect = { y: background.y, height: background.height };
  const row = props.payload as Row;
  const cx = x + width / 2;
  const zeroY = pixelForValue(plotRect, domain, 0);
  const elements: ReactElement[] = [];

  if (row.outerMissing) {
    elements.push(<MissingMarker key="om" x={x} y={zeroY} width={width} />);
    elements.push(<ValueLabel key="oml" x={cx} y={zeroY} text={NULL_PLACEHOLDER} tone="missing" place="above" />);
  } else {
    const outerValue = row.outerValue as number;
    const outerY = pixelForValue(plotRect, domain, outerValue);
    const { top, height } = normalizeRect(Math.min(outerY, zeroY), Math.abs(zeroY - outerY));
    elements.push(
      <rect key="or" x={x} y={top} width={width} height={Math.max(height, 1)} rx={3} fill={row.outerNegative ? LOSS : GREEN} fillOpacity={0.4} />,
    );
    elements.push(
      <ValueLabel
        key="orl"
        x={cx}
        y={row.outerNegative ? top + height : top}
        text={formatComma(outerValue)}
        tone={row.outerNegative ? "negative" : "default"}
        place={row.outerNegative ? "below" : "above"}
      />,
    );
  }

  if (row.zeroByFact) {
    elements.push(<StateChip key="chip" cx={cx} y={zeroY - 12} text="무배당" tone="filled" />);
  } else if (row.innerMissing) {
    elements.push(<StateChip key="chip" cx={cx} y={zeroY - 12} text={NULL_PLACEHOLDER} tone="muted" />);
  } else if (row.innerRaw !== null) {
    const innerY = pixelForValue(plotRect, domain, row.innerRaw);
    const { top, height } = normalizeRect(Math.min(innerY, zeroY), Math.abs(zeroY - innerY));
    const innerWidth = width * (row.innerSolo ? 0.34 : 0.5);
    elements.push(
      <rect
        key="ir"
        x={cx - innerWidth / 2}
        y={top}
        width={innerWidth}
        height={Math.max(height, 1)}
        rx={2}
        fill={GREEN}
        stroke={row.innerSolo ? PAPER : undefined}
        strokeWidth={row.innerSolo ? 1 : undefined}
      />,
    );
  }

  return <g>{elements}</g>;
}

export default function OverlaidBars({ bars, outerLabel, innerLabel }: OverlaidBarsProps): ReactElement {
  // ZERO_BY_FACT(무배당)는 값과 무관하게 안쪽 막대를 그리지 않으므로 스케일 계산에서도 뺀다.
  const innerForDomain = bars.map((b) => (b.innerState === "ZERO_BY_FACT" ? null : b.inner));
  const domain = padDomain(zeroInclusiveDomain([...bars.map((b) => b.outer), ...innerForDomain]));

  const data: Row[] = bars.map((b, i) => {
    const zeroByFact = b.innerState === "ZERO_BY_FACT";
    const outerNegative = b.outer !== null && b.outer < 0;
    const innerRaw = innerForDomain[i];
    const innerMissing = !zeroByFact && innerRaw === null;
    return {
      label: b.label,
      outerForScale: b.outer ?? 0,
      outerValue: b.outer,
      outerMissing: b.outer === null,
      outerNegative,
      innerRaw,
      zeroByFact,
      innerMissing,
      innerSolo: outerNegative && (innerRaw ?? 0) > 0,
    };
  });
  const hasLossYearDividend = data.some((r) => r.innerSolo);

  const renderBar = (props: BarShapeProps) => drawOverlayBar(props, domain);

  return (
    <div data-chart="overlaid-bars">
      <div className="chart-plot chart-plot--stackedOrOverlay">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 24, right: 8, left: 4, bottom: 0 }} barCategoryGap="24%">
            <CartesianGrid vertical={false} stroke={GRID_LINE} />
            <XAxis
              dataKey="label"
              tick={{ fill: AXIS_TEXT, fontSize: LABEL_FONT_SIZE_MIN }}
              tickLine={{ stroke: GRID_LINE }}
              axisLine={{ stroke: GRID_LINE }}
              tickMargin={6}
              height={28}
            />
            <YAxis
              domain={domain}
              tick={{ fill: AXIS_TEXT, fontSize: LABEL_FONT_SIZE_MIN }}
              tickLine={{ stroke: GRID_LINE }}
              axisLine={false}
              tickFormatter={(v: number) => formatComma(v)}
              width={52}
            />
            <ReferenceLine y={0} stroke={AXIS_TEXT} strokeOpacity={0.6} />
            <Bar
              dataKey="outerForScale"
              background={{ fill: "transparent" }}
              shape={renderBar}
              isAnimationActive={false}
              maxBarSize={BAR_MAX_SIZE}
              minPointSize={0}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="leg">
        <span>
          <span className="d" style={{ background: GREEN, opacity: 0.4 }} />
          {outerLabel}
        </span>
        <span>
          <span className="d" style={{ background: GREEN }} />
          {innerLabel}
        </span>
      </div>
      {hasLossYearDividend && (
        <div className="cnote">
          적자 연도의 {innerLabel}는 {outerLabel} 막대에 겹치지 않고 기준선 위에 따로 표시
        </div>
      )}
    </div>
  );
}
