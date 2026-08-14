"use client";

import { useEffect, useRef, useState } from "react";

import type { DartEnvelope } from "@/lib/dart/client";
import { buildDerivationLine } from "@/lib/derivationText";
import type { AttemptResult, DisplayState, Resolution } from "@/lib/normalize/types";

import styles from "./SourcePanel.module.css";

type RawRow = Record<string, unknown>;
type RawBody = { status: string; message: string; list?: RawRow[] };
type SnapshotEnvelope = DartEnvelope<RawBody>;

type SnapshotState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "loaded"; envelope: SnapshotEnvelope }
  | { phase: "error"; message: string };

type ProbeState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "match" }
  | { phase: "diff"; changedKeys: string[] }
  | { phase: "error"; message: string };

type TabId = "request" | "raw" | "fallback" | "normalize" | "derivation";

/** MetricCandidate.unit(lib/normalize/types.ts)과 동일한 도메인 — 정규화 탭 표기 기준. */
type MetricUnit = "KRW" | "PCT" | "X";

interface Props {
  resolution: Resolution;
  requestId: string;
  probeParams?: Record<string, string>;
  unit: MetricUnit;
}

const EOK = 100_000_000; // 1억

const DISPLAY_STATE_LABEL: Record<DisplayState, string> = {
  OK: "정상",
  ZERO_BY_FACT: "0원(사실 확인됨)",
  MISSING: "데이터 없음",
  NA_NEGATIVE_BASE: "N/A(분모 음수)",
  NOT_IN_PROFILE: "해당 없음(프로필)",
  SOURCE_NOT_AVAILABLE: "원천 미확보",
  // v2 T2
  TURN_TO_PROFIT: "흑자전환(QoQ/YoY)",
  TURN_TO_LOSS: "적자전환(QoQ/YoY)",
  LOSS_CONTINUED: "적자지속(QoQ/YoY)",
};

/**
 * `resolution.hit`이 가리키는 행을 원본 `list`에서 식별한다. 4개 원천이 서로 다른 필드를
 * 식별자로 쓰므로(§lib/normalize 리졸버 참조) requestId 접두사로 원천을 구분해 분기한다.
 * - fnlttSinglAcntAll: account_id + sj_div
 * - fnlttSinglIndx: idx_code (hit.sjDiv는 idxClCode를 담아 행 필드와 무관)
 * - alotMatter / stockTotqySttus: 행이 인덱스로 식별되고 se는 표시 라벨뿐이라, hit.accountNm
 *   (리졸버가 실제로 찾은 라벨 원문)과 se를 비교한다.
 */
function isHitRow(requestId: string, hit: NonNullable<Resolution["hit"]>, row: RawRow): boolean {
  if (requestId.startsWith("fnlttSinglAcntAll__")) {
    return row.account_id === hit.accountId && row.sj_div === hit.sjDiv;
  }
  if (requestId.startsWith("fnlttSinglIndx__")) {
    return row.idx_code === hit.accountId;
  }
  if (requestId.startsWith("alotMatter__") || requestId.startsWith("stockTotqySttus__")) {
    return row.se === hit.accountNm;
  }
  return false;
}

function diffTopLevelKeys(a: unknown, b: unknown): string[] {
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return JSON.stringify(a) === JSON.stringify(b) ? [] : ["(전체 응답)"];
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) changed.push(key);
  }
  return changed;
}

function attemptResultLabel(result: AttemptResult): string {
  if (result === "HIT") return "HIT";
  if (result === "NO_ROW") return "NO_ROW";
  return "EMPTY_VALUE";
}

function fallbackSummaryLine(resolution: Resolution): string {
  switch (resolution.displayState) {
    case "OK":
      return resolution.hit ? `→ ${resolution.hit.accountId}${resolution.hit.sjDiv ? ` @${resolution.hit.sjDiv}` : ""}에서 발견` : "→ 정상 확인";
    case "ZERO_BY_FACT":
      return "→ 값이 비어 있으나 무배당·무실적이 확인되어 0으로 표시";
    case "MISSING":
      return "→ 후보를 모두 시도했으나 미존재(원천에서 값을 찾지 못함)";
    case "NA_NEGATIVE_BASE":
      return "→ 분모가 음수라 산출 불가(N/A)";
    case "NOT_IN_PROFILE":
      return "→ 이 프로필에는 해당 지표가 없음";
    case "SOURCE_NOT_AVAILABLE":
      return "→ DART가 제공하지 않는 원천";
    case "TURN_TO_PROFIT":
      return "→ 직전 기간 ≤0 → 당기 >0 (흑자전환 — %는 의미가 없어 상태만 표기)";
    case "TURN_TO_LOSS":
      return "→ 직전 기간 >0 → 당기 ≤0 (적자전환 — %는 의미가 없어 상태만 표기)";
    case "LOSS_CONTINUED":
      return "→ 직전·당기 모두 ≤0 (적자지속 — %는 의미가 없어 상태만 표기)";
    default:
      return "";
  }
}

export default function SourcePanelClient({ resolution, requestId, probeParams, unit }: Props) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const hasFetchedRef = useRef(false);
  const [snapshot, setSnapshot] = useState<SnapshotState>({ phase: "idle" });
  const [probe, setProbe] = useState<ProbeState>({ phase: "idle" });
  const [tab, setTab] = useState<TabId>("request");
  const [onlyUsedRow, setOnlyUsedRow] = useState(false);

  // <details>는 부모(서버 컴포넌트)가 그린다 — 이벤트 핸들러를 JSX prop으로 붙일 수 없어
  // DOM을 거슬러 올라가 imperatively addEventListener한다. 최초 open 전환에서만 fetch한다.
  useEffect(() => {
    const details = anchorRef.current?.closest("details");
    if (!details) return;

    function handleToggle() {
      if (!details || !details.open || hasFetchedRef.current) return;
      hasFetchedRef.current = true;
      setSnapshot({ phase: "loading" });
      fetch(`/snapshots/${requestId}.json`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<SnapshotEnvelope>;
        })
        .then((envelope) => setSnapshot({ phase: "loaded", envelope }))
        .catch((err: unknown) => {
          setSnapshot({ phase: "error", message: err instanceof Error ? err.message : "스냅샷을 불러오지 못했습니다." });
        });
    }

    details.addEventListener("toggle", handleToggle);
    return () => details.removeEventListener("toggle", handleToggle);
  }, [requestId]);

  async function handleProbe() {
    if (!probeParams) return;
    setProbe({ phase: "loading" });
    try {
      const query = new URLSearchParams(probeParams);
      const res = await fetch(`/api/dart/probe?${query.toString()}`);
      const data: unknown = await res.json();
      if (!res.ok) {
        const message = data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
        setProbe({ phase: "error", message });
        return;
      }
      if (snapshot.phase !== "loaded") {
        setProbe({ phase: "error", message: "스냅샷을 먼저 불러온 뒤 비교할 수 있습니다(패널을 펼쳐주세요)." });
        return;
      }
      const liveBody = (data as SnapshotEnvelope).body;
      const changedKeys = diffTopLevelKeys(snapshot.envelope.body, liveBody);
      setProbe(changedKeys.length === 0 ? { phase: "match" } : { phase: "diff", changedKeys });
    } catch (err) {
      setProbe({ phase: "error", message: err instanceof Error ? err.message : "요청 실패" });
    }
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "request", label: "요청" },
    { id: "raw", label: "원본 JSON" },
    { id: "fallback", label: "폴백 이력" },
    { id: "normalize", label: "정규화" },
    ...(resolution.derivation ? ([{ id: "derivation", label: "파생 계산식" }] as const) : []),
  ];

  return (
    <div ref={anchorRef} className={styles.body}>
      <div role="tablist" className={styles.tabBar}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.tabPanel} role="tabpanel">
        {tab === "request" && (
          <RequestTab snapshot={snapshot} probe={probe} probeParams={probeParams} onProbe={handleProbe} />
        )}
        {tab === "raw" && (
          <RawTab
            snapshot={snapshot}
            requestId={requestId}
            hit={resolution.hit}
            onlyUsedRow={onlyUsedRow}
            onOnlyUsedRowChange={setOnlyUsedRow}
          />
        )}
        {tab === "fallback" && <FallbackTab resolution={resolution} />}
        {tab === "normalize" && <NormalizeTab resolution={resolution} unit={unit} />}
        {tab === "derivation" && resolution.derivation && <DerivationTab resolution={resolution} />}
      </div>
    </div>
  );
}

function RequestTab({
  snapshot,
  probe,
  probeParams,
  onProbe,
}: {
  snapshot: SnapshotState;
  probe: ProbeState;
  probeParams?: Record<string, string>;
  onProbe: () => void;
}) {
  if (snapshot.phase === "idle" || snapshot.phase === "loading") {
    return <p className={styles.hint}>{snapshot.phase === "loading" ? "원본 응답을 불러오는 중…" : "패널을 펼치면 원본 응답을 불러옵니다."}</p>;
  }
  if (snapshot.phase === "error") {
    return <p className={styles.errorText}>스냅샷 로드 실패: {snapshot.message}</p>;
  }

  const { envelope } = snapshot;
  const rows = envelope.body.list ?? [];

  return (
    <div>
      <dl className={styles.metaGrid}>
        <dt>요청 URL</dt>
        <dd className={styles.mono}>{envelope.requestUrl}</dd>
        <dt>status</dt>
        <dd>
          {envelope.status} ({envelope.message})
        </dd>
        <dt>행수</dt>
        <dd>{rows.length}행</dd>
        <dt>bytes</dt>
        <dd>{envelope.bytes.toLocaleString("ko-KR")} bytes</dd>
        <dt>elapsedMs</dt>
        <dd>
          {(envelope.elapsedMs / 1000).toFixed(2)}s ({envelope.elapsedMs}ms)
        </dd>
        <dt>fetchedAt</dt>
        <dd>{envelope.fetchedAt}</dd>
      </dl>

      {probeParams && (
        <div className={styles.probeBox}>
          <button type="button" className={styles.probeButton} onClick={onProbe} disabled={probe.phase === "loading"}>
            {probe.phase === "loading" ? "호출 중…" : "지금 다시 호출"}
          </button>
          {probe.phase === "match" && <span className={styles.badgeMatch}>일치</span>}
          {probe.phase === "diff" && (
            <span className={styles.badgeDiff}>
              상이 — 최상위 필드 {probe.changedKeys.length}개 변경 ({probe.changedKeys.join(", ")})
            </span>
          )}
          {probe.phase === "error" && <span className={styles.badgeError}>실패 — {probe.message}</span>}
        </div>
      )}
    </div>
  );
}

function RawTab({
  snapshot,
  requestId,
  hit,
  onlyUsedRow,
  onOnlyUsedRowChange,
}: {
  snapshot: SnapshotState;
  requestId: string;
  hit: Resolution["hit"];
  onlyUsedRow: boolean;
  onOnlyUsedRowChange: (v: boolean) => void;
}) {
  if (snapshot.phase === "idle" || snapshot.phase === "loading") {
    return <p className={styles.hint}>{snapshot.phase === "loading" ? "불러오는 중…" : "패널을 펼치면 원본 JSON을 불러옵니다."}</p>;
  }
  if (snapshot.phase === "error") {
    return <p className={styles.errorText}>로드 실패: {snapshot.message}</p>;
  }

  const rows = snapshot.envelope.body.list ?? [];
  const visibleRows = onlyUsedRow && hit ? rows.filter((row) => isHitRow(requestId, hit, row)) : rows;

  return (
    <div>
      {hit && (
        <label className={styles.toggleRow}>
          <input type="checkbox" checked={onlyUsedRow} onChange={(e) => onOnlyUsedRowChange(e.target.checked)} />
          사용된 행만 보기
        </label>
      )}
      <div className={styles.rawList}>
        {visibleRows.length === 0 && <p className={styles.hint}>표시할 행이 없습니다.</p>}
        {visibleRows.map((row, i) => {
          const used = hit ? isHitRow(requestId, hit, row) : false;
          return (
            <pre key={i} className={used ? `${styles.rawRow} ${styles.rawRowHit}` : styles.rawRow}>
              {JSON.stringify(row, null, 2)}
            </pre>
          );
        })}
      </div>
    </div>
  );
}

function FallbackTab({ resolution }: { resolution: Resolution }) {
  return (
    <div>
      {resolution.fsDivFallbackApplied && <p className={styles.fallbackNote}>CFS 013 → OFS 재시도</p>}
      {resolution.attempts.length === 0 ? (
        <p className={styles.hint}>시도 이력 없음 (파생 지표 — 파생 계산식 탭 참고)</p>
      ) : (
        <ol className={styles.attemptList}>
          {resolution.attempts.map((a, i) => (
            <li key={i} className={a.result === "HIT" ? styles.attemptHit : styles.attemptMiss}>
              {i + 1}) {a.accountId}
              {a.sjDiv ? ` @${a.sjDiv}` : ""} → {attemptResultLabel(a.result)}
            </li>
          ))}
        </ol>
      )}
      <p className={styles.fallbackSummary}>{fallbackSummaryLine(resolution)}</p>
    </div>
  );
}

/** unit별 "콤마 정리" 단계 접미사. KRW만 억 단위 2차 변환이 있다(그 외엔 억 개념이 없다). */
function unitSuffix(unit: MetricUnit): string {
  if (unit === "KRW") return "원";
  if (unit === "PCT") return "%";
  return "";
}

function NormalizeTab({ resolution, unit }: { resolution: Resolution; unit: MetricUnit }) {
  const { hit, normalized, fsDiv } = resolution;
  if (!hit || normalized === null) {
    return <p className={styles.hint}>정규화된 원장 값 없음 — 상태: {DISPLAY_STATE_LABEL[resolution.displayState]}</p>;
  }

  const parsedRaw = Number(hit.rawValue.replace(/,/g, ""));
  const hasNumber = Number.isFinite(parsedRaw);
  const commaValue = hasNumber ? `${parsedRaw.toLocaleString("ko-KR")}${unitSuffix(unit)}` : hit.rawValue;
  // 억 단위 2차 변환은 KRW 금액에만 의미가 있다 — PCT/X(예: 발행주식총수)에 붙이면 오표기가 된다.
  const showEok = unit === "KRW" && hasNumber && Math.abs(parsedRaw) >= EOK;
  const eok = showEok ? `${Math.round(parsedRaw / EOK).toLocaleString("ko-KR")}억원` : null;

  return (
    <div>
      <div className={styles.normalizeSteps}>
        <span className={styles.mono}>&quot;{hit.rawValue}&quot;</span>
        <span aria-hidden="true">→</span>
        <span className={eok ? styles.mono : undefined}>{eok ? commaValue : <strong>{commaValue}</strong>}</span>
        {eok && (
          <>
            <span aria-hidden="true">→</span>
            <strong>{eok}</strong>
          </>
        )}
      </div>
      <dl className={styles.metaGrid}>
        <dt>단위</dt>
        <dd>{unit}</dd>
        <dt>기준</dt>
        <dd>{fsDiv === "CFS" ? "연결(CFS)" : "별도(OFS)"}</dd>
        <dt>account_id</dt>
        <dd className={styles.mono}>{hit.accountId}</dd>
        <dt>account_nm</dt>
        <dd>{hit.accountNm}</dd>
        <dt>sj_div</dt>
        <dd>{hit.sjDiv || "-"}</dd>
        <dt>ord</dt>
        <dd>{hit.ord}</dd>
      </dl>
    </div>
  );
}

/**
 * v3 V5 — 구조화된 산식(`derivationDetail`)을 사람이 읽는 한 줄로 먼저 보여주고, 엔진이 남긴
 * 원본 문자열은 그 아래 원문으로 남긴다.
 *
 * 종전에는 문자열 하나를 mono 폰트로 가공 없이 찍었다 — `Q4 = 300,870,903,000,000 −
 * 225,082,634,000,000`처럼 원 단위 raw 숫자라 자릿수를 셀 수 없었다. 문자열을 파싱해서 고치지
 * 않고, 엔진이 생산 시점에 함께 남긴 구조를 읽는다(`lib/derivationText.ts` — FormulaPanel과
 * 같은 조립 함수라 두 자리의 문구가 어긋날 수 없다).
 */
function DerivationTab({ resolution }: { resolution: Resolution }) {
  if (!resolution.derivation) return null;
  const detail = resolution.derivationDetail;
  const line = detail ? buildDerivationLine(detail, resolution.normalized, resolution.displayState) : null;
  return (
    <div>
      {line && (
        <p className={styles.derivationLine}>
          <strong>{line.head}</strong> {line.transition ? "—" : "="} {line.body}
        </p>
      )}
      {line?.caveat && (
        <p className={line.caveatTone === "warning" ? styles.derivationCaveat : styles.derivationNote}>
          {line.caveatTone === "warning" ? "⚠" : "ℹ"} {line.caveat}
        </p>
      )}
      <p className={styles.hint}>원문(엔진 기록)</p>
      <p className={styles.mono}>{resolution.derivation}</p>
      <p className={styles.hint}>parserVersion {resolution.parserVersion}</p>
    </div>
  );
}
