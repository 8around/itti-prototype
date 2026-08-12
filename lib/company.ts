/**
 * `data/company/{stockCode}.json`(T2 company.json 스냅샷) 로더 — T10 종목 개요 섹션이 쓴다.
 * universe/page.tsx가 이미 같은 파일을 읽지만(원본 JSON collapse용, 타입 없이) 여기서는 개요
 * 섹션에 필요한 필드만 타입을 붙여 재사용한다. 원본 파일 자체는 여기서도 절대 수정하지 않는다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { DartEnvelope } from "./dart/client";

export interface CompanyBody {
  status: string;
  message: string;
  corp_code: string;
  corp_name: string;
  corp_name_eng?: string;
  stock_name: string;
  stock_code: string;
  ceo_nm: string;
  corp_cls: string;
  jurir_no?: string;
  bizr_no?: string;
  adres?: string;
  hm_url?: string;
  ir_url?: string;
  phn_no?: string;
  fax_no?: string;
  induty_code: string;
  est_dt: string;
  acc_mt: string;
}

export function loadCompany(stockCode: string): DartEnvelope<CompanyBody> {
  const raw = readFileSync(join(process.cwd(), "data", "company", `${stockCode}.json`), "utf-8");
  return JSON.parse(raw) as DartEnvelope<CompanyBody>;
}

/** "19690113" → "1969.01.13". 길이가 다르면(방어적으로) 원문 그대로 반환한다. */
export function formatEstDt(estDt: string): string {
  if (estDt.length !== 8) return estDt;
  return `${estDt.slice(0, 4)}.${estDt.slice(4, 6)}.${estDt.slice(6, 8)}`;
}
