/**
 * vitest 픽스처 로더 — public/snapshots의 실제 스냅샷을 그대로 읽는다 (mock 금지).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { DartEnvelope } from "../dart/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SNAPSHOTS_DIR = join(__dirname, "..", "..", "public", "snapshots");

export function loadFixture<T>(requestId: string): DartEnvelope<T> {
  const raw = readFileSync(join(SNAPSHOTS_DIR, `${requestId}.json`), "utf-8");
  return JSON.parse(raw) as DartEnvelope<T>;
}

// 테스트에서 반복 사용하는 corp_code (universe.json 기준).
export const CORP = {
  삼성전자: "00126380",
  KB금융: "00688996",
  헬릭스미스: "00359395",
  카카오: "00258801",
  LG화학: "00356361",
  앱클론: "00991191",
  신영증권: "00136721",
  삼성증권: "00104856",
  NH투자증권: "00120182",
  삼성생명: "00126256",
  DB손해보험: "00159102",
  // v2 T2 — QoQ/YoY 전환 상태(TURN_TO_PROFIT/TURN_TO_LOSS) 실측 케이스에 쓰인다.
  SK하이닉스: "00164779",
  POSCO홀딩스: "00155319",
} as const;
