/**
 * DART OpenAPI 허용 엔드포인트 목록 및 파라미터 계약.
 *
 * 허용 목록 밖 endpoint, 필수 파라미터 누락, 정의되지 않은 파라미터,
 * 값 도메인(reprt_code/fs_div/idx_cl_code)을 벗어난 값은 전부 여기서 걸러낸다.
 * 실제 값 도메인 근거는 ../../../ete-django/docs/dart-api/README.md §2, §3 참조.
 */

export const DART_BASE_URL = "https://opendart.fss.or.kr/api";

export const REPRT_CODES = ["11011", "11012", "11013", "11014"] as const;
export type ReprtCode = (typeof REPRT_CODES)[number];

export const FS_DIVS = ["CFS", "OFS"] as const;
export type FsDiv = (typeof FS_DIVS)[number];

export const IDX_CL_CODES = ["M210000", "M220000", "M230000", "M240000"] as const;
export type IdxClCode = (typeof IDX_CL_CODES)[number];

export const DART_ENDPOINTS = [
  "company",
  "fnlttSinglAcntAll",
  "fnlttSinglIndx",
  "alotMatter",
  "stockTotqySttus",
  "list",
] as const;

export type DartEndpoint = (typeof DART_ENDPOINTS)[number];

export function isDartEndpoint(value: string | null): value is DartEndpoint {
  return value !== null && (DART_ENDPOINTS as readonly string[]).includes(value);
}

interface EndpointParamSpec {
  required: readonly string[];
  optional: readonly string[];
}

/** 엔드포인트별 필수/선택 파라미터. 여기 없는 키가 오면 400. */
export const ENDPOINT_PARAMS: Record<DartEndpoint, EndpointParamSpec> = {
  company: {
    required: ["corp_code"],
    optional: [],
  },
  fnlttSinglAcntAll: {
    // fs_div 누락 시 DART가 status 100을 준다 — 필수로 강제
    required: ["corp_code", "bsns_year", "reprt_code", "fs_div"],
    optional: [],
  },
  fnlttSinglIndx: {
    // idx_cl_code는 콤마로 다중 지정 불가, 1개만
    required: ["corp_code", "bsns_year", "reprt_code", "idx_cl_code"],
    optional: [],
  },
  alotMatter: {
    required: ["corp_code", "bsns_year", "reprt_code"],
    optional: [],
  },
  stockTotqySttus: {
    required: ["corp_code", "bsns_year", "reprt_code"],
    optional: [],
  },
  list: {
    required: [],
    optional: ["corp_code", "bgn_de", "end_de", "pblntf_ty", "page_no", "page_count"],
  },
};

export type ParamValidationResult =
  | { ok: true; params: Record<string, string> }
  | { ok: false; error: string };

/**
 * endpoint별 필수/선택 파라미터 및 값 도메인을 검증한다.
 * DART 호출 전 단계 — 여기서 걸러야 DART가 status 100을 주는 상황(fs_div 누락 등)을 사전 차단한다.
 */
export function validateEndpointParams(
  endpoint: DartEndpoint,
  rawParams: Record<string, string>,
): ParamValidationResult {
  const spec = ENDPOINT_PARAMS[endpoint];
  const allowedKeys = new Set<string>([...spec.required, ...spec.optional]);

  for (const key of Object.keys(rawParams)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: `'${endpoint}'에 정의되지 않은 파라미터입니다: ${key}` };
    }
  }

  for (const key of spec.required) {
    if (!rawParams[key]) {
      return { ok: false, error: `'${endpoint}'에 필수 파라미터가 없습니다: ${key}` };
    }
  }

  if ("reprt_code" in rawParams && !(REPRT_CODES as readonly string[]).includes(rawParams.reprt_code)) {
    return { ok: false, error: `reprt_code 값이 올바르지 않습니다: ${rawParams.reprt_code}` };
  }

  if ("fs_div" in rawParams && !(FS_DIVS as readonly string[]).includes(rawParams.fs_div)) {
    return { ok: false, error: `fs_div 값이 올바르지 않습니다: ${rawParams.fs_div}` };
  }

  if ("idx_cl_code" in rawParams && !(IDX_CL_CODES as readonly string[]).includes(rawParams.idx_cl_code)) {
    return { ok: false, error: `idx_cl_code 값이 올바르지 않습니다: ${rawParams.idx_cl_code}` };
  }

  return { ok: true, params: rawParams };
}
