"use client";

import { useState, type FormEvent } from "react";

import {
  DART_ENDPOINTS,
  ENDPOINT_PARAMS,
  FS_DIVS,
  IDX_CL_CODES,
  REPRT_CODES,
  type DartEndpoint,
} from "@/lib/dart/endpoints";

import styles from "./page.module.css";

/** 필드별 입력 UI 힌트. 여기 없는 필드는 자유 텍스트 입력. */
const SELECT_OPTIONS: Partial<Record<string, readonly string[]>> = {
  reprt_code: REPRT_CODES,
  fs_div: FS_DIVS,
  idx_cl_code: IDX_CL_CODES,
};

const PLACEHOLDERS: Partial<Record<string, string>> = {
  corp_code: "00126380",
  bsns_year: "2024",
  bgn_de: "20260710",
  end_de: "20260810",
  pblntf_ty: "I",
  page_no: "1",
  page_count: "100",
};

type ProbeResult =
  | { kind: "envelope"; data: Record<string, unknown> }
  | { kind: "error"; status: number; data: Record<string, unknown> };

export default function DebugPage() {
  const [endpoint, setEndpoint] = useState<DartEndpoint>("fnlttSinglAcntAll");
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);

  const spec = ENDPOINT_PARAMS[endpoint];
  const fields = [...spec.required, ...spec.optional];

  function handleEndpointChange(next: DartEndpoint) {
    setEndpoint(next);
    setValues({});
    setResult(null);
  }

  function handleValueChange(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const query = new URLSearchParams({ endpoint });
    for (const key of fields) {
      const value = values[key]?.trim();
      if (value) query.set(key, value);
    }

    try {
      const res = await fetch(`/api/dart/probe?${query.toString()}`);
      const data = await res.json();
      setResult(res.ok ? { kind: "envelope", data } : { kind: "error", status: res.status, data });
    } catch (err) {
      setResult({
        kind: "error",
        status: 0,
        data: { error: err instanceof Error ? err.message : "요청 실패" },
      });
    } finally {
      setLoading(false);
    }
  }

  const envelope = result?.kind === "envelope" ? result.data : null;
  const listLength = Array.isArray(envelope?.body && (envelope.body as { list?: unknown }).list)
    ? ((envelope!.body as { list: unknown[] }).list.length)
    : null;

  return (
    <main className={styles.main}>
      <h1>DART 원본 뷰어 (/debug)</h1>
      <p className={styles.hint}>
        허용된 6개 엔드포인트만 호출 가능하다. 응답은 DART 원본 그대로이며, 요청 URL의 API 키는 항상 마스킹된다.
      </p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span>endpoint</span>
          <select value={endpoint} onChange={(e) => handleEndpointChange(e.target.value as DartEndpoint)}>
            {DART_ENDPOINTS.map((ep) => (
              <option key={ep} value={ep}>
                {ep}
              </option>
            ))}
          </select>
        </label>

        {fields.map((key) => {
          const options = SELECT_OPTIONS[key];
          const required = (spec.required as readonly string[]).includes(key);
          return (
            <label key={key} className={styles.field}>
              <span>
                {key}
                {required ? " *" : ""}
              </span>
              {options ? (
                <select value={values[key] ?? ""} onChange={(e) => handleValueChange(key, e.target.value)}>
                  <option value="">(선택)</option>
                  {options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={values[key] ?? ""}
                  placeholder={PLACEHOLDERS[key]}
                  onChange={(e) => handleValueChange(key, e.target.value)}
                />
              )}
            </label>
          );
        })}

        <button type="submit" disabled={loading}>
          {loading ? "호출 중…" : "호출"}
        </button>
      </form>

      {result && (
        <section className={styles.result}>
          {result.kind === "envelope" ? (
            <dl className={styles.meta}>
              <dt>status</dt>
              <dd>{String(envelope?.status)}</dd>
              <dt>message</dt>
              <dd>{String(envelope?.message)}</dd>
              <dt>elapsedMs</dt>
              <dd>{String(envelope?.elapsedMs)}</dd>
              <dt>bytes</dt>
              <dd>{String(envelope?.bytes)}</dd>
              <dt>fetchedAt</dt>
              <dd>{String(envelope?.fetchedAt)}</dd>
              <dt>requestUrl</dt>
              <dd className={styles.url}>{String(envelope?.requestUrl)}</dd>
              {listLength !== null && (
                <>
                  <dt>list.length</dt>
                  <dd>{listLength}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className={styles.error}>HTTP {result.status}</p>
          )}
          <pre className={styles.pre}>{JSON.stringify(result.data, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}
