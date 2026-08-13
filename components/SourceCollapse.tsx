import type { ReactNode } from "react";

import styles from "./SourceCollapse.module.css";

/**
 * V4 — 차트 1개에 딸린 출처 카드(TraceOnly/QuarterTraceOnly)를 단일 `<details>`로 묶는다.
 * 값을 직접 보여주는 필드(RawField/GatedField — MetricValue + SourcePanel)는 대상이 아니다.
 * 출처 추적만 하는 카드(라벨 + SourcePanel뿐)가 차트당 최대 8~9개씩 늘어서 세로 길이를
 * 잡아먹는 문제만 좁혀서 해결한다(브리프 §V4).
 *
 * 서버 컴포넌트다 — 네이티브 `<details>`라 여닫기에 JS가 0바이트다.
 *
 * 중첩 `<details>` 주의: 이 컴포넌트 내부의 각 카드는 자신만의 `SourcePanel`(자체 `<details>`)을
 * 갖는다. `SourcePanelClient`는 `closest("details")`로 "가장 가까운" `<details>`를 찾아 거기에만
 * `toggle` 리스너를 붙이므로, 이 바깥 접기가 아니라 항상 카드 자신의 `<details>`를 찾는다 — 중첩
 * 자체는 lazy fetch 대상을 헷갈리게 하지 않는다. 그리고 브라우저는 닫힌 `<details>`의 내용을
 * 렌더링하지 않으므로(요약을 제외한 자식이 화면에 없음) 바깥이 닫혀 있으면 안쪽 summary를 클릭할
 * 수조차 없어 toggle 자체가 발생하지 않는다 — 즉 바깥이 닫힌 상태에서 안쪽 fetch가 새어나갈
 * 경로가 없다(실측: task-V4-report.md).
 *
 * V5(산식 레이어)가 같은 자리를 쓴다 — `formulaSlot`에 "이 값은 이렇게 계산됐다" 패널을 넣으면
 * 되고, 이 컴포넌트의 구조(summary 문구·body 배치)는 그대로 둔다. 지금은 항상 비어 있다.
 */
export function SourceCollapse({ count, children, formulaSlot }: { count: number; children: ReactNode; formulaSlot?: ReactNode }) {
  return (
    <details className={styles.collapse}>
      <summary className={styles.summary}>
        <span aria-hidden="true" className={styles.marker}>
          ▶
        </span>
        출처 {count}건 · 산식 보기
      </summary>
      <div className={styles.body}>
        {formulaSlot && <div className={styles.formulaSlot}>{formulaSlot}</div>}
        <div className={styles.cards}>{children}</div>
      </div>
    </details>
  );
}
