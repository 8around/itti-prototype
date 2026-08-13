import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { AXIS_TEXT, CASH_FINANCING, CASH_INVESTING, CATEGORY_PALETTE, CHIP_BG, GREEN, GRID_LINE, LOSS, MISSING, MUTED_TEXT, PAPER, PROVISIONAL, VALUE_LABEL_COLOR } from "./chartTheme";

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
