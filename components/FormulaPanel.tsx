import { buildDerivationLine } from "@/lib/derivationText";
import type { Resolution } from "@/lib/normalize/types";

import styles from "./FormulaPanel.module.css";

/**
 * v3 V5 — "이 차트의 값은 이렇게 계산됐습니다". `SourceCollapse`의 `formulaSlot`에 들어간다.
 *
 * 사용자 요청("차트에 나타나는 값을 어떻게 그렸는지 산식과 그 논리구조를 설명할 수 있으면
 * 좋겠어")의 화면 쪽 답이다. 지금까지 산식은 SourcePanel을 펼치고 '파생 계산식' 탭을 눌러야
 * 나왔고, 그나마 원 단위 raw 숫자(`300,870,903,000,000`)를 그대로 찍고 있었다.
 *
 * **서버 컴포넌트다** — 접기(`<details>`)는 네이티브라 JS가 필요 없고, 이 패널도 정적 텍스트라
 * 클라이언트 번들에 아무것도 더하지 않는다. 닫혀 있는 동안 브라우저가 렌더조차 하지 않으므로
 * V4가 줄여 놓은 세로 길이에도 영향이 없다.
 *
 * 렌더 대상이 하나도 없으면(직독 지표만 있는 차트) `null`을 반환해 슬롯 자체가 사라진다 —
 * 산식이 없는 차트에 빈 상자가 생기지 않는다.
 */

export type FormulaEntry = {
  /** 화면이 아는 기간 표기("24.4Q"/"24년"/"제71기 4Q") — 엔진은 결산월을 몰라 만들 수 없다. */
  periodLabel?: string;
  resolution: Resolution;
};

/** 파생 지표는 `attempts`(폴백 이력)가 비어 있다 — 두 정보가 배타적이라는 사실을 화면에서 잇는다. */
const ATTEMPTS_HINT = "파생 지표는 폴백 이력(시도한 account_id)이 없다 — 계산에 쓰인 값 각각의 원문 출처는 아래 출처 카드에서 확인할 수 있다.";

export default function FormulaPanel({ entries }: { entries: FormulaEntry[] }) {
  const lines = entries
    .filter((e) => e.resolution.derivationDetail)
    .map((e) => ({
      key: `${e.periodLabel ?? ""}-${e.resolution.metricKey}`,
      provisional: e.resolution.provisional === true,
      ...buildDerivationLine(e.resolution.derivationDetail!, e.resolution.normalized, e.resolution.displayState, e.periodLabel),
    }));

  if (lines.length === 0) return null;

  return (
    <div className={styles.panel} data-formula-panel>
      <div className={styles.title}>이 차트의 값은 이렇게 계산됐습니다</div>
      <ul className={styles.list}>
        {lines.map((line) => (
          <li key={line.key} className={styles.item}>
            <span className={styles.head}>{line.head}</span>
            <span aria-hidden="true" className={styles.rel}>
              {line.transition ? "—" : "="}
            </span>
            <span className={styles.body}>{line.body}</span>
            {line.caveat && (
              <span className={line.caveatTone === "warning" ? styles.caveat : styles.caveatNote}>
                {line.caveatTone === "warning" ? "⚠" : "ℹ"} {line.caveat}
              </span>
            )}
            {line.provisional && <span className={styles.prov}>차트에는 잠정치(점선)로 표시된다</span>}
          </li>
        ))}
      </ul>
      <p className={styles.hint}>{ATTEMPTS_HINT}</p>
    </div>
  );
}
