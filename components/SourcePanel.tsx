import type { Resolution } from "@/lib/normalize/types";

import styles from "./SourcePanel.module.css";
import SourcePanelClient from "./SourcePanelClient";

/**
 * SourcePanel — 모든 차트·수치 밑에 붙는 출처 추적 collapse (T5, 사용자 명시 요구사항).
 *
 * 바깥 `<details>`/`<summary>`는 이 파일(서버 컴포넌트)이 그린다 — 여닫기 자체는 브라우저
 * 네이티브 동작이라 JS 0바이트다. 탭 5개짜리 내부만 `SourcePanelClient`("use client")로
 * 분리했고, 그 안에서 `<details>`를 DOM으로 찾아 `toggle` 이벤트에 원본 JSON을 lazy fetch한다
 * (최초 1회만 — 이벤트 핸들러 자체를 서버 컴포넌트가 소유한 `<details>`에 직접 붙일 수는
 * 없으므로 `closest("details")` + `addEventListener`로 우회했다. 상세: task-T5-report.md).
 */

export type SourcePanelSummaryMeta = {
  /** "DART 사업보고서" 등 사람이 읽는 출처 이름. */
  source: string;
  basis: "연결" | "별도";
  /** "2025.03.11" 등 사람이 읽는 기준일 표기. */
  asOf: string;
  parserVersion: string;
};

export type SourcePanelProps = {
  /** 폴백/정규화/파생 탭의 원천 — lib/normalize 정규화 엔진(T4) 산출물 그대로. */
  resolution: Resolution;
  /** `public/snapshots/<requestId>.json` 파일명(확장자 제외) — 레인 A 원본 lazy fetch에 쓴다. */
  requestId: string;
  /** "지금 다시 호출"용 /api/dart/probe 쿼리 파라미터(endpoint 포함). 없으면 버튼을 숨긴다. */
  probeParams?: Record<string, string>;
  summaryMeta: SourcePanelSummaryMeta;
};

export default function SourcePanel({ resolution, requestId, probeParams, summaryMeta }: SourcePanelProps) {
  return (
    <details className={styles.panel}>
      <summary className="srcfoot">
        출처 {summaryMeta.source} · 기준 {summaryMeta.basis} · 기준일 {summaryMeta.asOf} · 파서 {summaryMeta.parserVersion} · 원문 보기{" "}
        <span aria-hidden="true">›</span>
      </summary>
      <SourcePanelClient resolution={resolution} requestId={requestId} probeParams={probeParams} />
    </details>
  );
}
