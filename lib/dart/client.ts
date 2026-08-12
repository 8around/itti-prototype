/**
 * DART OpenAPI 서버 사이드 클라이언트.
 *
 * 함정 대응 (../../../ete-django/docs/dart-api/README.md §3, §4 근거):
 * - 모든 에러가 HTTP 200으로 온다 → status로만 판정한다.
 * - status != "000"이면 list 키 자체가 없다 → 호출부에서 body.list ?? [] 로 접근할 것.
 * - 013(조회 데이터 없음)은 정상 종료, 재시도 금지.
 * - 800/900(시스템 점검·미정의 오류)만 1회 백오프 재시도.
 * - 010/011/012/100 등 나머지 비정상 status는 즉시 중단(재시도 없음) — 그대로 envelope에 담아 반환한다.
 */

import { DART_BASE_URL, type DartEndpoint } from "./endpoints";

export type DartEnvelope<T = unknown> = {
  /** crtfc_key=***MASKED*** 로 치환된 실제 요청 URL */
  requestUrl: string;
  /** DART 응답 status ("000" = 정상) */
  status: string;
  message: string;
  fetchedAt: string;
  elapsedMs: number;
  bytes: number;
  /** DART 원본 응답 그대로 (status/message/list 등 포함) */
  body: T;
};

const TIMEOUT_MS = 8000;
const RETRY_BACKOFF_MS = 1000;
const RETRYABLE_STATUSES = new Set(["800", "900"]);
const MASK = "***MASKED***";

export class DartClientError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DartClientError";
  }
}

interface DartRawBody {
  status: string;
  message: string;
  list?: unknown;
}

function maskApiKey(url: string, apiKey: string): string {
  return url.split(apiKey).join(MASK);
}

async function fetchWithTimeout(url: string): Promise<{ text: string; elapsedMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    const text = await res.text();
    return { text, elapsedMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

function parseBody(text: string): DartRawBody {
  try {
    return JSON.parse(text) as DartRawBody;
  } catch (err) {
    throw new DartClientError("DART 응답이 JSON이 아닙니다.", err);
  }
}

/**
 * 검증된 파라미터로 DART 엔드포인트를 호출한다.
 * 파라미터 허용 목록/값 도메인 검증은 endpoints.ts::validateEndpointParams 책임이며,
 * 이 함수는 이미 검증된 params가 넘어온다고 가정한다.
 */
export async function callDartEndpoint<T = unknown>(
  endpoint: DartEndpoint,
  params: Record<string, string>,
): Promise<DartEnvelope<T>> {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    throw new DartClientError("DART_API_KEY가 설정되지 않았습니다 (.env.local 확인).");
  }

  const search = new URLSearchParams({ crtfc_key: apiKey, ...params });
  const url = `${DART_BASE_URL}/${endpoint}.json?${search.toString()}`;
  const requestUrl = maskApiKey(url, apiKey);
  const fetchedAt = new Date().toISOString();

  let elapsedMs = 0;
  let raw: string;

  try {
    const first = await fetchWithTimeout(url);
    elapsedMs += first.elapsedMs;
    raw = first.text;
  } catch (err) {
    throw new DartClientError(`DART 요청 실패: ${endpoint}`, err);
  }

  let body = parseBody(raw);

  if (RETRYABLE_STATUSES.has(body.status)) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    try {
      const retry = await fetchWithTimeout(url);
      elapsedMs += retry.elapsedMs;
      raw = retry.text;
      body = parseBody(raw);
    } catch (err) {
      throw new DartClientError(`DART 재시도 실패: ${endpoint}`, err);
    }
  }

  return {
    requestUrl,
    status: body.status,
    message: body.message,
    fetchedAt,
    elapsedMs,
    bytes: Buffer.byteLength(raw, "utf-8"),
    body: body as T,
  };
}
