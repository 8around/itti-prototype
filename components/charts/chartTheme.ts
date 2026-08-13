/**
 * chartTheme.ts — 차트 색·치수·타이포의 단일 출처(V0).
 *
 * 이 파일을 만든 이유: v2까지는 82px 세로 예산(모바일 목업 치수)과 `#c5cec7`(대비 1.61:1) 같은
 * 하드코딩 색이 컴포넌트·CSS 여기저기 흩어져 있어 "흑자가 안 보인다"는 결함이 반복 재생산됐다.
 * V1~V3(Recharts 전환)는 색·치수·폰트 크기를 여기서만 가져와야 한다 — 컴포넌트에 hex나
 * `"var(--x)"` 문자열을 직접 쓰지 말 것.
 *
 * 색은 `app/globals.css`의 CSS 커스텀 프로퍼티와 **같은 값을 리터럴 hex로 중복 보유**한다(단일
 * "정의"가 아니라 단일 "값의 출처" — 두 파일이 다른 형태로 같은 값을 반영). CSS 변수 문자열이 아닌
 * 리터럴 hex를 택한 이유:
 *
 * 1) Recharts(및 대다수 SVG 차트 라이브러리)는 `fill`/`stroke`로 받은 색상 문자열을 그대로
 *    DOM에 꽂기만 하는 게 아니라, hover/active 상태의 명도 조정이나 그라디언트 stop 보간에
 *    자체 색상 파서(주로 `d3-color` 계열)를 거쳐 재계산하는 경로가 있다. `d3-color`는
 *    `rgb()`/`hsl()`/hex/색상명은 파싱하지만 `var(--token)` 문자열은 유효한 CSS 색상 리터럴이
 *    아니므로 파싱에 실패해 `null`을 반환한다 — 이 경로를 타는 곳에서는 조용히 색이 빠진다.
 * 2) `fill="var(--x)"`처럼 DOM에 직접 꽂히는 단순 경우는 최신 브라우저에서 대체로 동작하지만,
 *    "대체로 동작"에 기대는 대신 실패 모드가 없는 리터럴을 기본값으로 삼는 편이 SSG 렌더 결정성
 *    (`isAnimationActive={false}`와 같은 목적)에도 맞는다.
 *
 * 값이 바뀌면 **이 파일과 `app/globals.css` 양쪽을 함께 수정**할 것 — 각 상수 옆 주석에 대응하는
 * CSS 커스텀 프로퍼티 이름을 달아 어긋남을 찾기 쉽게 했다.
 *
 * 대비는 WCAG 2.x 상대휘도 공식(`L = 0.2126R + 0.7152G + 0.0722B`, sRGB 감마 보정 포함)으로
 * 흰 배경(`--paper #ffffff`) 대비 계산했다 — 산출 근거는 task-V0-report.md 참고.
 */

// ============================================================
// 색 — 의미색(semantic)
// ============================================================

/** 양수/흑자. `--green`과 동일 값. 흰 배경 대비 5.13:1. */
export const GREEN = "#2e7d32";

/** 손실/적자·악화. `--up`과 동일 값(토큰명은 "up"이지만 의미는 부정적 방향 — 기존 관례 유지).
 * 흰 배경 대비 4.98:1. */
export const LOSS = "#d32f2f";

/** 잠정치(4Q 역산 등) 강조색. `--prov`와 동일 값. 점선 테두리 + 연한 채움으로 쓰고 단독 텍스트로는
 * 쓰지 않는다 — 흰 배경 대비 2.09:1로 3:1 미달이지만, 잠정 여부는 점선 패턴 + "잠정" 텍스트 라벨로
 * 이중 인코딩되어 색 하나에 의존하지 않는다(WCAG 1.4.11 비텍스트 대비는 정보가 색 외의 수단으로도
 * 전달될 때 예외를 허용). 기존 `.qbfill.prov`/`.zbf.prov`가 이미 같은 값을 쓰고 있어 V0에서 새로
 * 만든 색이 아니다. */
export const PROVISIONAL = "#f2a31e";

/** 잠정 막대의 연한 채움. 기존 `.qbfill.prov` 등과 동일 값. */
export const PROVISIONAL_FILL = "rgba(242, 163, 30, 0.07)";

/** 결측(null) placeholder. `--line`과 동일 값. 흰 배경 대비 1.22:1 — 의도적 저대비(존재감을 죽여야
 * "값 없음"이 "낮은 값"으로 오독되지 않는다) + 항상 "—" 텍스트와 함께 쓴다. */
export const MISSING = "#e3eae4";

/** 현금흐름 "투자" 계열 고정색. `--down`과 동일 값. 흰 배경 대비 5.75:1. */
export const CASH_INVESTING = "#1565c0";

/** 현금흐름 "재무" 계열 고정색. `--orange-dk`와 동일 값. 흰 배경 대비 4.24:1. */
export const CASH_FINANCING = "#b26a00";

/**
 * 현금흐름 3계열(영업/투자/재무) 고정 색상 — 팔레트 순환이 아니라 **의미로 고정**한다
 * (global-constraints.md §1 "카테고리 팔레트 재배치" 참고). 순서는 [영업, 투자, 재무].
 *
 * `app/stock/[code]/page.tsx`의 `SignedGroupedBars` 호출부가 이미
 * `seriesLabels={["영업", "투자", "재무"]}` 순서를 쓰고, 아래 `CATEGORY_PALETTE[0..2]`도 같은
 * 순서로 [GREEN, CASH_INVESTING, CASH_FINANCING]이라 값이 우연이 아니라 의도적으로 맞물린다.
 * V1~V3에서 현금흐름 차트를 Recharts로 재작성할 때 팔레트 순환 대신 이 상수를 series별로 직접
 * 매핑할 것 — `CATEGORY_PALETTE`를 재정렬해도 이 상수는 값이 고정되어 흔들리지 않는다.
 */
export const CASH_FLOW_SERIES_COLORS = [GREEN, CASH_INVESTING, CASH_FINANCING] as const;

// ============================================================
// 색 — 카테고리 팔레트(범용, hue 분리)
// ============================================================

/**
 * 5색 카테고리 팔레트. `app/globals.css`의 `--chart-1`..`--chart-5`와 같은 값(V0에서 함께
 * 재배치). 기존 팔레트는 `--chart-1`/`--chart-2`가 둘 다 초록, `--chart-4`/`--chart-5`가 둘 다
 * 청회색이라 인접 카테고리가 색으로 구별되지 않았다(대비도 2.61/2.19/1.68:1로 3:1 미달).
 *
 * 재배치 기준: hue를 최대한 분리(녹색 123° · 청색 211° · 주황 38° · 보라 271° · 청록 171°)하고
 * 전 색 흰 배경 대비 ≥3:1(계산값은 report 참고). 기존 의미색과 겹치는 자리는 새 색을 만들지 않고
 * 재사용했다 — chart-1=GREEN, chart-2=CASH_INVESTING(--down), chart-3=CASH_FINANCING(--orange-dk).
 * chart-4(보라)·chart-5(청록)만 이번에 새로 추가한 색이다.
 */
export const CATEGORY_PALETTE = [
  GREEN, // --chart-1, 흰 배경 대비 5.13:1
  CASH_INVESTING, // --chart-2 (구 #6baf7e), 흰 배경 대비 5.75:1
  CASH_FINANCING, // --chart-3 (구 #e8a13a), 흰 배경 대비 4.24:1
  "#6a4c93", // --chart-4 (구 #5b8fa8), 보라, 흰 배경 대비 6.85:1
  "#00796b", // --chart-5 (구 #b4cbd9), 청록, 흰 배경 대비 5.32:1
] as const;

// ============================================================
// 치수(px) — Recharts 전환(V1~V3) 대상 상수.
// 현재 CSS 기반 12종 컴포넌트의 82px/86px 치수는 V0에서 변경하지 않는다(범위 밖 — V1~V3 소관).
// ============================================================

/** 플롯 높이(px, 데스크톱 기준). 기존 82px 고정값(375px 폰 목업 치수를 그대로 이식한 값)을
 * 대체한다 — 820px 폭 데스크톱 차트에서 10:1 종횡비가 나던 문제의 근본 원인. */
export const PLOT_HEIGHT = {
  /** 분기 막대(QuarterBars·ZeroAxisBars 계열). */
  quarterBars: 220,
  /** 꺾은선(LineChart). */
  line: 180,
  /** 누적·오버레이 막대(StackedBarsAbs·OverlaidBars·SignedGroupedBars 등). */
  stackedOrOverlay: 200,
} as const;

/** 모바일 브레이크포인트(px 미만이면 모바일). 현재 전 CSS `@media` 0건 — V0이 최초 도입. */
export const MOBILE_BREAKPOINT_PX = 640;

/** 모바일에서 `PLOT_HEIGHT` 각 값에 곱하는 배율(−30%). */
export const MOBILE_HEIGHT_SCALE = 0.7;

/** Recharts `Bar`의 `maxBarSize` 상한 — 3개 이하 카테고리에서 막대가 뚱뚱한 블록이 되는 것을
 * 막는다. */
export const BAR_MAX_SIZE = 44;

/** 막대 폭 하한(px) — 데이터가 많아 자동 폭이 이보다 작아지면 이 값으로 고정. */
export const BAR_MIN_SIZE = 6;

// ============================================================
// 타이포
// ============================================================

/** 축 눈금·값 라벨 최소 폰트 크기(px). 기존 6.5~9px(8분기 화면은 compactLabels로 축 6.5px·값
 * 7px까지 축소)를 대체한다. */
export const LABEL_FONT_SIZE_MIN = 11;

/** 값 라벨(막대 위 숫자 등) font-weight. 학습가이드 `bars()`와 동일. */
export const VALUE_LABEL_FONT_WEIGHT = 700;
