/**
 * v2 T4 — 연도/분기 상수 단일 정의. "2024 고정" 하드코딩을 걷어내는 유일한 소스.
 *
 * `LATEST_ANNUAL_YEAR`/`LATEST_QUARTER_*`는 T1이 실제로 수집한 스냅샷 범위(2026-08 기준)를
 * 반영한 값이다 — 이전에는 `app/stock/[code]/page.tsx`·`app/page.tsx` 각자가 `"2024"`를
 * 따로 하드코딩해서 갱신을 놓치기 쉬웠다(이번 개편의 계기). 데이터 수집 범위가 넓어지면 이
 * 파일의 상수만 갱신하면 된다 — 다른 파일에서 연도/분기 리터럴을 새로 만들지 말 것.
 *
 * 헤더 문구("최신 분기 2026 1Q(잠정)")는 이 상수를 그대로 쓰지만, 실제 차트 윈도(분기 막대·
 * 재무상태 최신 분기말 등)는 이 상수에 의존하지 않고 종목·지표별 실제 데이터 유무로 자체
 * 계산한다(`app/stock/[code]/page.tsx`의 `latestQuarterWindow` 참조) — 두 자리가 어긋나도
 * 차트가 깨지지 않도록 의도적으로 분리했다.
 */

export const ALL_ANNUAL_YEARS = ["2023", "2024", "2025"] as const;
export const LATEST_ANNUAL_YEAR = "2025";

export const LATEST_QUARTER_BSNS_YEAR = "2026";
export const LATEST_QUARTER_NUM = 1 as const;
/** `QuarterResolutions.period`와 동일한 형식("2026Q1") — 정렬·조회 키. */
export const LATEST_QUARTER_PERIOD = `${LATEST_QUARTER_BSNS_YEAR}Q${LATEST_QUARTER_NUM}`;
/** 헤더 문구용 — "2026 1Q" 형식(브리프 명시). */
export const LATEST_QUARTER_HEADER_LABEL = `${LATEST_QUARTER_BSNS_YEAR} ${LATEST_QUARTER_NUM}Q`;

/** "제 71 기 1분기말" → "71". fiscalPeriodName 원문에서 "제N기" 숫자만 뽑아낸다. */
function fiscalYearNumber(fiscalPeriodName: string): string | null {
  const m = /제\s*(\d+)\s*기/.exec(fiscalPeriodName);
  return m ? m[1] : null;
}

/**
 * 분기 차트 x축 라벨. 12월 결산 종목은 "26.1Q"(연도 축약) 형식을 쓴다.
 *
 * 비12월 결산 종목(신영증권)은 **반드시 `fiscalPeriodName`(thstrm_nm 원문)에서 뽑은 "제N기"
 * 숫자를 써야 한다** — bsnsYear+quarter로 합성한 라벨("FY2026 4Q" 등)은 실제로 오답이 될 수
 * 있다: 실측 확인 결과 신영증권은 `bsnsYear=2026,quarter=4`(reprtCode 11011) 스냅샷이 실제로는
 * 이미 확정 제출된 "제72기" 연간 보고서라 "FY2026"이라는 합성 라벨이 마치 미래 분기처럼 오해를
 * 준다(task-T2-report.md §3 "제71기 왜곡"과 동일한 종류의 함정). `fiscalPeriodName`이 비어 있는
 * (MISSING) 분기만 최후 수단으로 "FY{bsnsYear} {quarter}Q"로 폴백한다 — 어차피 실제 라벨이 없는
 * 자리 표시 구간이라 오해 소지가 없다.
 */
export function quarterAxisLabel(bsnsYear: string, quarter: 1 | 2 | 3 | 4, accMt: string, fiscalPeriodName?: string): string {
  if (accMt !== "12") {
    const fyNum = fiscalPeriodName ? fiscalYearNumber(fiscalPeriodName) : null;
    return fyNum ? `제${fyNum}기 ${quarter}Q` : `FY${bsnsYear} ${quarter}Q`;
  }
  return `${bsnsYear.slice(2)}.${quarter}Q`;
}
