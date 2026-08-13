import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  AXIS_RESERVE_PX,
  AXIS_TEXT,
  CASH_FINANCING,
  CASH_INVESTING,
  CATEGORY_PALETTE,
  CHIP_BG,
  GREEN,
  GRID_LINE,
  LOSS,
  MISSING,
  MOBILE_HEIGHT_SCALE,
  MUTED_TEXT,
  PAPER,
  PLOT_HEIGHT,
  PROVISIONAL,
  VALUE_LABEL_COLOR,
} from "./chartTheme";

/**
 * chartTheme.ts의 색 상수는 `app/globals.css`의 `:root` CSS 커스텀 프로퍼티와 같은 값을 리터럴
 * hex로 중복 보유한다(chartTheme.ts 상단 doc 참고 — Recharts 내부 색상 재계산이 `var()` 문자열을
 * 파싱하지 못하는 문제를 피하려고 리터럴을 택했다). 두 출처가 어긋나면 차트와 나머지 UI의 색이
 * 조용히 갈라지는데, 지금까지는 이걸 주석으로만 약속하고 있었다 — 이 테스트가 그 약속을 강제한다.
 *
 * 새 의존성을 추가하지 않고 `app/globals.css`를 직접 읽어 정규식으로 `:root` 블록만 파싱한다.
 * 전체 CSS 파서가 아니라 "`--토큰: 값;` 선언 목록 추출"만 하는 최소 구현 — 이 프로젝트의
 * `:root`가 중첩 블록·중첩 주석 없이 단순 선언 나열이라 충분하다.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function parseRootTokens(): Record<string, string> {
  const cssPath = join(__dirname, "..", "..", "app", "globals.css");
  const css = readFileSync(cssPath, "utf-8");

  const rootMatch = css.match(/:root\s*\{([^}]*)\}/);
  if (!rootMatch) {
    throw new Error("app/globals.css에서 :root 블록을 찾지 못했다 — 파일 구조가 바뀌었으면 이 파서도 함께 손봐야 한다.");
  }

  // 값 파싱 전에 블록 주석을 걷어낸다 — 주석 안에 "--chart-1/2가 ..."처럼 "--이름" 뒤에 다른
  // 문자가 오는 텍스트가 있어도, 콜론이 없으면 아래 선언 정규식과 매치되지 않으니 실은 없어도
  // 안전하지만, 코드 리뷰가 쉽도록 명시적으로 제거한다.
  const body = rootMatch[1].replace(/\/\*[\s\S]*?\*\//g, "");

  const tokens: Record<string, string> = {};
  const declRegex = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = declRegex.exec(body)) !== null) {
    tokens[m[1]] = m[2].trim();
  }
  return tokens;
}

function readGlobalsCss(): string {
  const cssPath = join(__dirname, "..", "..", "app", "globals.css");
  return readFileSync(cssPath, "utf-8");
}

/** `.chart-plot--{name} { ... height: NNNpx ... }` 선언에서 height 값을 뽑는다. */
function extractChartPlotHeight(css: string, name: string): number {
  const re = new RegExp(`\\.chart-plot--${name}\\s*\\{[^}]*?height:\\s*(\\d+(?:\\.\\d+)?)px`);
  const m = css.match(re);
  if (!m) {
    throw new Error(`app/globals.css에서 .chart-plot--${name}의 height 선언을 찾지 못했다 — 클래스가 삭제되거나 이름이 바뀌었을 수 있다.`);
  }
  return Number(m[1]);
}

/**
 * `.chart-plot--*`를 담은 `@media (max-width: 640px) { ... }` 블록 본문만 잘라낸다. 이 파일에는
 * 같은 미디어 쿼리 블록이 여럿 있어(`.siteNav` 등) 문구만으로는 특정할 수 없다 — 블록의
 * 여는/닫는 중괄호는 "줄 맨 앞(들여쓰기 없음)에 오는 `}`"를 바깥쪽 닫는 중괄호로 보고(안쪽
 * `.chart-plot--*` 규칙의 닫는 중괄호는 항상 들여써져 있어 이 구분이 안전하다) 전 블록을 순회해
 * `.chart-plot--`를 포함한 첫 블록을 반환한다.
 */
function extractMobileMediaBlock(css: string): string {
  const blockRe = /@media \(max-width:\s*640px\)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(css)) !== null) {
    if (m[1].includes(".chart-plot--")) return m[1];
  }
  throw new Error("app/globals.css에서 .chart-plot--*를 포함한 @media (max-width: 640px) 블록을 찾지 못했다.");
}

describe("chartTheme.ts <-> app/globals.css .chart-plot--* 치수 동기화(V2 이월 항목 #1)", () => {
  // V1 우려사항 #1 — 색 토큰(위 describe)과 달리 PLOT_HEIGHT/AXIS_RESERVE_PX/MOBILE_HEIGHT_SCALE는
  // "리터럴 중복 + 주석 약속"뿐이었다. `AXIS_RESERVE_PX`를 chartTheme.ts에 명명 상수로 올리고
  // 여기서 CSS 실측치와 동기화를 강제한다.
  const css = readGlobalsCss();
  const mobileCss = extractMobileMediaBlock(css);
  const names = Object.keys(PLOT_HEIGHT) as Array<keyof typeof PLOT_HEIGHT>;

  it.each(names)("데스크톱 .chart-plot--%s 높이 = PLOT_HEIGHT + AXIS_RESERVE_PX", (name) => {
    const actual = extractChartPlotHeight(css, name);
    const expected = PLOT_HEIGHT[name] + AXIS_RESERVE_PX;
    expect(actual, `.chart-plot--${name} = ${actual}px 인데 PLOT_HEIGHT.${name}(${PLOT_HEIGHT[name]}) + AXIS_RESERVE_PX(${AXIS_RESERVE_PX}) = ${expected}px — 값을 바꿨다면 두 파일을 함께 고칠 것.`).toBe(
      expected,
    );
  });

  it.each(names)("모바일(max-width:640px) .chart-plot--%s 높이 = PLOT_HEIGHT × MOBILE_HEIGHT_SCALE + AXIS_RESERVE_PX", (name) => {
    const actual = extractChartPlotHeight(mobileCss, name);
    const expected = PLOT_HEIGHT[name] * MOBILE_HEIGHT_SCALE + AXIS_RESERVE_PX;
    expect(
      actual,
      `모바일 .chart-plot--${name} = ${actual}px 인데 PLOT_HEIGHT.${name}(${PLOT_HEIGHT[name]}) × MOBILE_HEIGHT_SCALE(${MOBILE_HEIGHT_SCALE}) + AXIS_RESERVE_PX(${AXIS_RESERVE_PX}) = ${expected}px.`,
    ).toBe(expected);
  });
});

describe("chartTheme.ts <-> app/globals.css :root 색 토큰 동기화", () => {
  const tokens = parseRootTokens();

  function expectSameHex(cssTokenName: string, themeValue: string, themeConstantLabel: string) {
    const cssValue = tokens[cssTokenName];
    expect(cssValue, `app/globals.css :root에 ${cssTokenName}가 없다 — 토큰이 삭제되거나 이름이 바뀌었을 수 있다`).toBeDefined();
    expect(
      cssValue?.toLowerCase(),
      `${cssTokenName}(app/globals.css) = ${cssValue} 인데 ${themeConstantLabel}(chartTheme.ts) = ${themeValue} — 두 출처가 어긋났다. 값을 바꿨다면 두 파일을 함께 고칠 것.`,
    ).toBe(themeValue.toLowerCase());
  }

  it("GREEN === --green", () => {
    expectSameHex("--green", GREEN, "GREEN");
  });

  it("LOSS === --up", () => {
    expectSameHex("--up", LOSS, "LOSS");
  });

  it("PROVISIONAL === --prov", () => {
    expectSameHex("--prov", PROVISIONAL, "PROVISIONAL");
  });

  it("MISSING === --line", () => {
    expectSameHex("--line", MISSING, "MISSING");
  });

  it("CASH_INVESTING === --down", () => {
    expectSameHex("--down", CASH_INVESTING, "CASH_INVESTING");
  });

  it("CASH_FINANCING === --orange-dk", () => {
    expectSameHex("--orange-dk", CASH_FINANCING, "CASH_FINANCING");
  });

  it("CATEGORY_PALETTE[0..4]가 --chart-1..5와 각각 일치한다", () => {
    expect(CATEGORY_PALETTE.length, "CATEGORY_PALETTE는 --chart-1..5 5개에 대응해야 한다").toBe(5);
    CATEGORY_PALETTE.forEach((color, i) => {
      expectSameHex(`--chart-${i + 1}`, color, `CATEGORY_PALETTE[${i}]`);
    });
  });

  // V1 추가 — Recharts 축/그리드/값 라벨 색.
  it("GRID_LINE === --line", () => {
    expectSameHex("--line", GRID_LINE, "GRID_LINE");
  });

  it("AXIS_TEXT === --gray", () => {
    expectSameHex("--gray", AXIS_TEXT, "AXIS_TEXT");
  });

  it("VALUE_LABEL_COLOR === --ink-2", () => {
    expectSameHex("--ink-2", VALUE_LABEL_COLOR, "VALUE_LABEL_COLOR");
  });

  it("MUTED_TEXT === --gray-2", () => {
    expectSameHex("--gray-2", MUTED_TEXT, "MUTED_TEXT");
  });

  it("CHIP_BG === --line-2", () => {
    expectSameHex("--line-2", CHIP_BG, "CHIP_BG");
  });

  it("PAPER === --paper", () => {
    expectSameHex("--paper", PAPER, "PAPER");
  });
});
