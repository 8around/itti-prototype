# DART 연동 프로토타입 — 개발 플랜

**상태** 계획 확정 · 구현 미착수
**작성일** 2026-08-11
**위치** `itti/itti-dart-prototype/docs/specs/` — 이 프로토타입의 작업 디렉터리
**관련 자료** [도메인 입문서 (Artifact)](https://claude.ai/code/artifact/41b656d6-b3d4-49c7-af00-1ad56806fa7c) · [`dart-api/`](../../../ete-django/docs/dart-api/) 명세 9종

> DART 명세 문서는 `ete-django` 저장소에, 이 문서는 프로토타입 저장소에 있다. 링크가 `../../../ete-django/docs/` 상대경로이므로 **두 디렉터리가 `itti/` 아래 나란히 있어야** 열린다.

---

## 1. 왜 만드는가

### 약속

슬랙 `#pj-외부-이띠`에서 PM이 클라이언트에게 공지했다.

> 이번 주는 프로토타입으로해서 DART API 연동하여 예시종목 20개로해서 그래프 만들어서 보여드리도록하겠습니다. **프로토타입 목표는 DART API 연동을 하여 데이터 형식 파악이 목표입니다.**
> — 이주호-AI

### 진짜 목적

단순히 "DART 붙였다"를 보여주는 게 아니다. 클라이언트가 슬랙에서 **요구사항을 대폭 정정**했고, 프로토타입은 **그 정정을 이해했음을 증명**하는 물건이어야 한다.

정정의 핵심 세 가지:

**① 비금융 공통이지 모든 종목 공통이 아니다** (김예지 연구원)

> "모든 종목 공통"이 아니라 **"비금융 공통"**입니다 (가장 중요). 금융 155개(은행·증권·보험·지주·캐피탈)는 손익 구조 자체가 달라 매출→매출총이익→영업이익이 없습니다. 즉 고정 스키마가 아니라 **'프로필별 후보 지표 + 존재 여부 플래그'** 구조입니다.

**② 성장 원인은 공통 비율이 아니라 업종별 오버레이에 있다**

> 삼성 리레이팅 원인 = 메모리 ASP +14% + DS부문 66→130조이지 ROE가 아님. 최종 구조는 **[공통 7셋] + [업종 오버레이]**.

**③ 사업부문 매출 구성이 빠져 있다** — 삼성 DX/DS/SDC/Harman

그리고 양준호 담당자가 제기한 실무 문제:

> 기업마다 DART 표기 방식이 달라 **수동으로 발라내는 일이 비일비재**합니다. NH증권과 삼성증권은 돈 버는 방식이 똑같은데 표현방식만 다릅니다.

### 우리가 가진 무기

`docs/dart-api/` 9개 문서 3,392줄. **실호출 약 490회** 기반이고, 위 지적과 정확히 일치하는 실측 결과를 이미 확보했다.

| 클라이언트 지적 | 우리 실측 |
|---|---|
| 금융은 매출이 없다 | KB금융 `ifrs-full_Revenue` **행 자체가 없음** 확인 |
| 4분기는 연간−3Q누적 | 삼성전자 2024로 **검산 완료** (75,788,269백만원) |
| 무배당 0 vs 데이터없음 | `alotMatter` 무배당도 `status=000` — status로 판정 불가 확인 |
| 표기 방식이 회사마다 다름 | `account_nm` 불일치 8개사 실측표 확보 |

**프로토타입은 이 실측값을 그대로 화면에 올린다.**

---

## 2. 확정 사항

| 항목 | 결정 | 근거 |
|---|---|---|
| 스택 | Next.js (App Router) + TypeScript | 사용자 지정 |
| 배치 | `itti/itti-dart-prototype/` **별도 로컬 저장소, 원격 push 없음** | 사용자 지정 |
| 이번 주 범위 | **T0 ~ T7 + T10(종목 상세)** | T8·T9·T11·T12는 다음 주 |
| 차트 라이브러리 | **도입 안 함** | §4 참조 |
| 데이터 조달 | 빌드타임 스냅샷 + 온디맨드 라이브 | §5 참조 |
| CSS | Tailwind 미도입, 목업 CSS 직접 이식 | §4 참조 |

> ⚠️ 원격 push가 없으므로 **Vercel Git 연동을 쓸 수 없다.** 배포가 필요해지면 `vercel deploy` CLI 직접 업로드 방식이어야 한다. 이번 주 범위에는 배포(T12)가 없다.

---

## 3. 20종목 유니버스

**선정 원칙: 각 종목이 최소 하나의 함정을 실증한다.** 대형주 20개를 그냥 넣으면 프로토타입의 가치가 절반 이하가 된다.

| 프로필 | 종목 | `corp_code` | 실증 대상 |
|---|---|---|---|
| 표준·제조 | 삼성전자 | `00126380` | 기준선. 4Q 역산 검산값 확보 |
| 표준·제조 | SK하이닉스 / 현대차 / POSCO홀딩스 / LG화학 | — | 계정명 편차 |
| 표준·IT | 카카오 | `00258801` | **IS 0행(CIS만)**, 순손실인데 배당 |
| 표준·IT | NAVER | — | 비교군 |
| 표준·바이오 | 셀트리온 | `00413046` | `stock_knd` 전 행 `"-"`인데 실제 배당 |
| 표준·바이오 | 헬릭스미스 | `00359395` | **EPS 행 없음 → 폴백 체인**, 적자, 무배당 |
| 표준·바이오 | 신라젠 | `00919966` | 적자 (ROE −28.05) |
| 표준·수주 | 두산에너빌리티 | `00159616` | EPS 값이 빈 문자열 |
| 표준·수주 | HD현대중공업 | `01390344` | **희석 EPS 행 없음** |
| 표준·소형 | 앱클론 | `00991191` | **CFS `013` → OFS 폴백** |
| 표준 | 결산월 ≠ 12 종목 1개 | T2에서 확정 | 비12월 결산 시계열 |
| 금융·지주 | KB금융 | `00688996` | **`ifrs-full_Revenue` 행 없음**, 지표 66→34 |
| 금융·지주 | 신한지주 | — | 지주 간 표기 차이 |
| 금융·증권 | **삼성증권** | — | ★ 양준호 지적 |
| 금융·증권 | **NH투자증권** | — | ★ 동일 비즈니스, 다른 표기 |
| 금융·보험 | 삼성생명 | — | 보험손익 계정 |
| 금융·보험 | DB손해보험 | — | 생보 vs 손보 차이 |

비금융 13 / 금융 7 (신영증권 편입 결과). 실제 비율(2,401 : 155)보다 **금융을 의도적으로 과대표집**했다. 금융이 이번 프로토타입의 증명 대상이기 때문이다.

`universe.json` 스키마 — 김예지가 요구한 **'손익구조' 컬럼**을 그대로 반영:

```json
{
  "stockCode": "105560",
  "corpCode": "00688996",
  "name": "KB금융",
  "market": "Y",
  "indutyCode": "64992",
  "ksic2": "64",
  "accMt": "12",
  "profile": "FIN_HOLDING",
  "profileSource": "KSIC_AUTO | MANUAL",
  "note": "ifrs-full_Revenue 행 없음"
}
```

`profileSource`가 중요하다. KSIC 앞 2자리(`64`/`65`/`66`)로 **금융/비금융 1차 판정은 자동**이지만, 은행·증권·보험·지주 세분류는 KSIC만으로 깨끗하게 갈리지 않는다. 자동 판정과 수동 확정을 **둘 다 저장하고 화면에 표시**해서, 클라이언트가 "이 분류가 어디까지 자동화되고 어디부터 사람이 필요한가"를 정확히 보게 한다.

---

## 4. 기술 결정

### 차트 라이브러리를 쓰지 않는다

목업 `docs/goals-in-2months/이띠_R1_배포앱_목업_6.html`(1,376줄, 17화면)은 **차트 라이브러리 없이** 구현되어 있다. `<script>` 태그가 0개다.

- 막대·게이지·스택바 → CSS `height:%` / `width:%` div **13종**
- 파이·꺾은선·스파크라인 → 인라인 SVG `<path>` / `<polyline>` **3종**

| | Recharts/visx | 목업 프리미티브 이식 |
|---|---|---|
| 목업 재현도 | 축·툴팁·범례 기본 스타일과 싸워야 함 | 픽셀 일치 |
| 워터폴 · 0축발산 · 잠정 dashed 구간 | 전부 커스텀 렌더러 | 이미 CSS로 존재 |
| 번들 | ~100KB gz | **0KB** |
| RSC | `"use client"` + ResizeObserver 강제 | 서버 렌더, JS 0 |

데이터 포인트가 분기 5개 수준이라 **라이브러리가 해결하는 문제(축 스케일링·브러시·크로스헤어)가 하나도 발생하지 않는다.** 유일한 계산은 파이 arc인데 헬퍼 15줄이면 된다.

> 재검토 조건: 장기 시계열(20분기+) 브러시/줌이나 크로스헤어 툴팁이 요구되면 그때 `visx`만 검토.

### Tailwind를 쓰지 않는다

목업의 `:root` 토큰 40여 개와 프리미티브 클래스가 이미 완성되어 있다. Tailwind로 옮기면 순손실이다. `--no-tailwind` + `globals.css`에 목업 CSS 이식.

토큰은 CSS 변수이므로 나중에 Tailwind v4 `@theme`으로 흡수하는 건 언제든 가능하다(역방향은 어렵다).

⚠️ **이식 시 고쳐야 할 목업 CSS 버그 2건**
- `--orange-dk` / `--orange-bg` — 4회·1회 사용되는데 `:root`에 **미정의**
- `--line2` — 9회 사용되는데 실제 토큰명은 `--line-2` (테두리가 렌더링 안 됨)

### 색·서체 토큰

```
--green: #2E7D32     브랜드
--up:    #D32F2F     상승 (적색 — 한국 관례)
--down:  #1565C0     하락 (청색)
--t1/--t2/--t0       신뢰도 3단계
차트 팔레트: #2E7D32 #6BAF7E #E8A13A #5B8FA8 #B4CBD9  ← 현재 인라인 하드코딩, 토큰화 필요
잠정/파생 강조: #F2A31E + dashed
서체: Pretendard 단일 + font-feature-settings:'tnum'
```

---

## 5. 데이터 아키텍처

### 호출량 산정 (20종목 × 2023~2025)

| 대상 | 호출 수 |
|---|---|
| `company.json` × 20 | 20 |
| `fnlttSinglAcntAll` 11011 × 3년 × CFS→OFS 폴백(1.25배) | ~75 |
| `fnlttSinglAcntAll` 11014 × 3년 (4Q 역산용) | ~75 |
| `fnlttSinglIndx` 4카테고리 × 3년 (콤마 다중지정 불가) | 240 |
| `alotMatter` × 20 (1회로 3개년 반환) | 20 |
| `stockTotqySttus` × 3년 | 60 |
| **합계** | **약 470회 · 일일 한도의 2.4% · 25MB · 20초** |

### 왜 라이브 팬아웃이 아닌가

| 전략 | 응답속도 | 데모 안정성 | 판단 |
|---|---|---|---|
| 매 요청 라이브 팬아웃 | 종목당 25~35 호출 직렬 → 5초+ | DART 점검(`800`)이면 화면 빔. **Vercel 함수 타임아웃** | ✗ |
| ISR (`revalidate=86400`) | 첫 방문자만 느림 | 콜드스타트 + 팬아웃 조합이 여전히 위험 | △ |
| **스냅샷 + 온디맨드 라이브** | 즉시 | 최상 | **채택** |

**결정적 근거: DART 재무 데이터는 분기당 1회 갱신되는 저빈도 데이터다.** 실시간 호출의 정보 가치가 0에 수렴한다. 반면 클라이언트 미팅 중 화면이 비는 리스크는 치명적이다.

"진짜 호출한 게 맞냐"는 의심은 **각 collapse의 "지금 다시 호출" 버튼**이 해결한다. 라이브 응답과 스냅샷을 나란히 놓고 일치/상이를 표시하므로, 오히려 **스키마 변경 감지 카나리 역할까지 겸한다** ([`dart-api/schema-monitoring.md`](../../../ete-django/docs/dart-api/schema-monitoring.md)의 UI 버전).

### 3레인 구조

```
레인 A (원본)    public/snapshots/<requestId>.json   collapse 펼칠 때 lazy fetch
레인 B (정규화)  data/derived.json                   RSC가 정적 import
레인 C (라이브)  /api/dart/probe                     "지금 다시 호출" 버튼 전용
```

원본은 종목당 100~200KB다. 초기 HTML에 인라인하면 20종목 페이지가 수 MB가 된다. A/B 분리로 해결하고, 동시에 원본이 공개 URL로 노출되어 클라이언트가 직접 검증할 수 있게 된다(DART 데이터는 공개 정보. 단 마스킹된 URL만 저장).

### 스크립트 2단 분리

```
pnpm snapshot:fetch    DART 호출 (약 470회)
pnpm snapshot:build    캐시된 원본에서 재정규화 — API 호출 0회
```

폴백 체인을 고칠 때마다 DART를 다시 때리지 않아도 되고, 반복 개발이 오프라인으로 가능해진다.

### 보안

- API 키는 **Route Handler에만**. `NEXT_PUBLIC_` 접두사 절대 금지
- Route Handler는 엔드포인트를 **허용 목록으로 제한** (오픈 프록시/SSRF 방지)
- 응답의 `requestUrl`은 `crtfc_key=***MASKED***`로 치환
- `runtime = "nodejs"` (ZIP 매직바이트 처리에 Buffer 필요), `dynamic = "force-dynamic"`

---

## 6. 디렉터리 구조

```
itti/
├─ ete-django/                    (기존 Django 저장소)
└─ itti-dart-prototype/           (신규 · git init · remote 없음)
   ├─ app/
   │  ├─ layout.tsx               Pretendard · 토큰 CSS · tnum
   │  ├─ page.tsx                 20종목 리스트 + 커버리지 %
   │  ├─ debug/page.tsx           T1  원본 호출 뷰어
   │  ├─ universe/page.tsx        T2  유니버스 표 (손익구조 컬럼)
   │  ├─ kitchen-sink/page.tsx    T6  프리미티브 전시
   │  ├─ compare/pnl/page.tsx     T7  ★ 삼성전자 vs KB금융
   │  ├─ stock/[code]/page.tsx    T10 종목 상세 (공통 7섹션 + 프로필 분기)
   │  └─ api/dart/probe/route.ts  라이브 프록시 (allowlist)
   ├─ lib/dart/
   │  ├─ client.ts                HTTP · status 판정 · 키 마스킹 · 백오프
   │  ├─ endpoints.ts             허용 목록 + 파라미터 타입
   │  ├─ parse.ts                 parseAmount
   │  ├─ resolve.ts               account_id 폴백 체인 → Resolution
   │  ├─ profiles.ts              프로필 × 후보 지표 카탈로그
   │  ├─ derive.ts                4Q 역산 · ROA · 영업이익률 · FCF
   │  └─ types.ts
   ├─ components/
   │  ├─ charts/                  프리미티브 8종
   │  ├─ SourcePanel.tsx          ★ collapse
   │  └─ MetricValue.tsx          displayState 6종 단일 진입점
   ├─ data/                       universe.json · derived.json · manifest.json
   ├─ public/snapshots/           원본 JSON ~150개 (약 25MB)
   └─ scripts/                    resolve-corp-codes · snapshot-fetch · snapshot-build
```

---

## 7. 핵심 자료구조

김예지의 *"고정 스키마가 아니라 프로필별 후보 지표 + 존재 여부 플래그"*를 **타입 레벨에서 그대로 구현**한다.

```ts
type ProfileId =
  | "STANDARD"
  | "FIN_BANK" | "FIN_SECURITIES" | "FIN_INSURANCE" | "FIN_HOLDING";

type MetricCandidate = {
  key: string;              // "net_interest_income"
  label: string;            // "순이자손익"
  accountIds: string[];     // 폴백 체인
  sjDivPriority: string[];  // ["IS","CIS"]
  unit: "KRW" | "PCT" | "X";
  sourceAvailable: boolean; // false = DART에 원천 없음 (BIS비율 등)
};

type Resolution = {
  metricKey: string;
  attempts: {
    accountId: string;
    sjDiv?: string;
    result: "HIT" | "NO_ROW" | "EMPTY_VALUE";
  }[];
  hit?: { accountId: string; accountNm: string; sjDiv: string; rawValue: string; ord: number };
  fsDiv: "CFS" | "OFS";
  fsDivFallbackApplied: boolean;
  normalized: number | null;
  displayState:
    | "OK"                    // 정상
    | "ZERO_BY_FACT"          // 무배당 확인 → 0원
    | "MISSING"               // 우리가 못 읽음 → 데이터 없음
    | "NA_NEGATIVE_BASE"      // 분모 음수 → N/A
    | "NOT_IN_PROFILE"        // 이 프로필에 해당 없음
    | "SOURCE_NOT_AVAILABLE"; // DART 미제공
  derivation?: string;        // "Q4 = 300,870,903,000,000 − 225,082,634,000,000"
  parserVersion: string;
};
```

**렌더링 규칙**: `HIT`인 것만 그리고, 나머지는 collapse에 *"후보 8개 중 5개 존재 / 3개 미존재(사유별)"*로 노출. **화면이 종목마다 다르게 나오는 게 정상 동작**임을 클라이언트가 눈으로 확인하게 된다.

`displayState`가 6종인 이유 — `ZERO_BY_FACT`(무배당 확인 → 0원)와 `MISSING`(못 읽음 → 데이터 없음)을 **타입 레벨에서 갈라놔야** 실수로 섞이지 않는다. 클라이언트가 명시적으로 요구한 처리다.

---

## 8. 태스크

각 태스크는 독립 검증 가능하고, 끝날 때마다 보여줄 화면이 나온다.

### T0 — 환경 세팅 *(사용자 직접 수행)*

**목표** Next.js 프로젝트가 로컬에서 뜬다.

> ℹ️ `itti-dart-prototype/` 디렉터리는 이 문서 때문에 **이미 존재한다.** `create-next-app`은 기존 디렉터리를 만나면 충돌 파일을 검사하는데, `docs`는 허용 목록(`validFiles`)에 포함되어 있어 **그대로 진행된다.** 이 문서를 옮기거나 지울 필요가 없다.
>
> 혹시 충돌 오류가 나면 `docs/`를 잠시 상위로 옮겼다가 스캐폴딩 후 되돌리면 된다.

```bash
node -v                                     # 20.x 또는 22.x
corepack enable && corepack prepare pnpm@latest --activate

cd /Volumes/DYIexs/Projects/8around/itti
pnpm create next-app@latest itti-dart-prototype \
  --typescript --app --eslint --no-tailwind --no-src-dir --import-alias "@/*"

cd itti-dart-prototype
pnpm add -D tsx vitest
git init          # 로컬 전용 · remote 추가하지 않음
```

⚠️ `create-next-app`이 자신의 `README.md`를 쓴다. 이 계획 문서를 `docs/` 안에 둔 이유이기도 하다.

`.env.local` — 커밋 금지 (`.gitignore`에 기본 포함):
```
DART_API_KEY=<발급받은 40자 hex>
```

**완료 판정** `pnpm dev` → `localhost:3000` · `git status`에 `.env.local`이 **안 나타남**

**규모** 30분 · **선행** 없음

---

### T1 — DART 클라이언트 + 프록시 + 원본 뷰어

**목표** 브라우저에서 실제 DART 응답 원본을 본다. 첫 "진짜 호출된다" 증거.

**작업**
- `endpoints.ts` — 허용 목록 6종: `company` `fnlttSinglAcntAll` `fnlttSinglIndx` `alotMatter` `stockTotqySttus` `list`
- `client.ts`
  - **`status !== "000"` 판정** — 모든 에러가 HTTP 200으로 온다 (함정 #1)
  - `body.list ?? []` — `status != 000`이면 `list` 키가 없다 (#2)
  - `013`=정상종료(재시도 금지) / `020`=즉시중단 / `800`,`900`=백오프 / `010`,`011`,`012`,`100`=즉시중단
  - `AbortController` 8초 타임아웃
  - 반환 봉투에 `requestUrl`(마스킹) · `status` · `message` · `fetchedAt` · `elapsedMs` · `bytes`
- `api/dart/probe/route.ts` — 허용 목록 밖은 400
- `/debug` — 엔드포인트 드롭다운 + corp_code/연도 입력 + 원본 pretty JSON + 메타 헤더

**완료 판정**
- 삼성전자 `00126380` / 2024 / 11011 / CFS → `status "000"`, **213행**
- 앱클론 `00991191` CFS → `013`, OFS → **118행**
- Network 탭에 `crtfc_key`가 **어디에도 없음**
- 응답 `requestUrl`이 `crtfc_key=***MASKED***`

**규모** 반나절 (~250 LOC) · **선행** T0

---

### T2 — 20종목 유니버스 확정

**목표** `universe.json` 20행 확정 + 화면 표시.

**작업**
1. `scripts/resolve-corp-codes.ts` — `corpCode.xml` 1회 다운로드
   - **ZIP 매직 `PK\x03\x04` 분기 필수** (에러 시 XML이 온다)
   - 비상장 `stock_code`는 **공백 1개**이므로 `.strip()` 후 판정 (#14)
   - 동명이인 주의 (우리금융지주 2건 등)
   - 전체 파일은 커밋하지 않고 **20행 결과만** 커밋
2. `company.json` × 20 → `induty_code` · `acc_mt` · `corp_cls` 수집
3. `ksic2 = indutyCode.slice(0,2)` — **zero-fill 금지** (#16). `64`/`65`/`66` → 금융 자동 판정
4. 금융 세부 프로필은 수동 확정, `profileSource: "MANUAL"` 기록
5. `acc_mt !== "12"` 종목이 0개면 유니버스를 조정해 1개 확보

**완료 판정**
- `/universe`에 20행: 종목코드 · 이름 · 시장 · KSIC · **KSIC앞2** · 결산월 · **손익구조** · 판정출처
- 금융 7 / 비금융 13 · `acc_mt !== "12"` 최소 1건
- 각 행 collapse에 `company.json` 원본

**규모** 반나절 · **선행** T1

---

### T3 — 스냅샷 수집

**목표** 원본 전량 확보 + 함정이 실제로 몇 건 터졌는지 수치화.

**작업**
- 동시성 4, 요청 간 150ms
- `fnlttSinglAcntAll`은 **CFS 시도 → `013`이면 OFS 재시도**, 폴백 발생 여부를 manifest에 기록 (#37)
- `fnlttSinglIndx`는 카테고리당 개별 호출 (**콤마 다중지정 불가**, #42)
- `alotMatter`는 `bsns_year=2025, reprt_code=11011` **1회로 2023~2025 커버**
- `020` 감지 시 즉시 전체 중단
- 원본을 **가공 없이 그대로** `public/snapshots/<endpoint>__<corp>__<year>__<reprt>__<fsDiv>.json`
- `data/manifest.json`에 status 분포 · 소요시간 · 바이트 · 폴백 이력

**완료 판정** — 콘솔 리포트가 아래를 출력:
```
총 호출        468회 / 성공(000) 4xx / 013 xx / 기타 0
CFS→OFS 폴백  N개 종목: 앱클론, ...
IS 0행 종목    M개: 카카오, KB금융, HD현대중공업, 헬릭스미스, 신라젠, ...
소요           약 20초 / 25MB
```
- `--dry-run`이 호출 없이 계획만 출력
- 재실행이 idempotent (이미 있는 파일 스킵)

> **이 리포트 자체가 클라이언트에게 보여줄 산출물이다.** "폴백이 실제로 N건 발생했다"가 설계 정당성을 증명한다.

**규모** 반나절 · **선행** T2

---

### T4 — 정규화 엔진

**목표** 지표를 뽑되 **어떻게 뽑았는지 전 과정이 `Resolution`으로 남는다.**

**작업**

```ts
// parse.ts
export function parseAmount(v?: string): number | null {
  if (v == null) return null;
  const s = v.trim();
  if (s === "" || s === "-" || s === "#########") return null;  // #3 #4 #41
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
```

- `resolve.ts` — 폴백 체인 실행기. 각 시도를 `HIT`/`NO_ROW`/`EMPTY_VALUE`로 기록
  - `sj_div` 우선순위 `["IS","CIS"]` (#32)
  - `ifrs-full_ProfitLoss`가 IS/CIS/CF에 3중복 → `sj_div` 우선순위로 dedupe (#35)
  - `account_detail === "-"`가 사실상 본표 합계행 필터
- `derive.ts`
  - **4Q 역산** = `11011.thstrm_amount − 11014.thstrm_add_amount`. `derivation`에 양변 실수치 기록. **BS는 시점 데이터라 제외** (#39)
  - ROA = `ifrs-full_ProfitLoss ÷ ifrs-full_Assets` — `M212000`은 영업이익 기준이라 ROA가 아니다
  - 영업이익률 = `dart_OperatingIncomeLoss ÷ ifrs-full_Revenue` — **금융 프로필은 `NOT_IN_PROFILE`**
  - **FCF = 영업활동현금흐름 − CAPEX**
  - 배당성향 fallback = `현금배당금총액(idx4) ÷ (연결)당기순이익(idx1) × 100`, 순이익 음수면 `NA_NEGATIVE_BASE` (#23)
- `alotMatter` 파싱 — **인덱스 기반 + 라벨 검증 이중화**. `stock_knd` 필터 금지, **행 위치로 보통주/우선주 판정** (#22). 2015년 14행 / 2016년 `(개별)` / 2017+ `(별도)` 3가지 분기
- `stockTotqySttus` — `se === "비고"` 행 제외 (#27)

> ⚠️ **스파이크 30분 필요** — **CAPEX의 `account_id`가 미확인**이다. 명세 문서에 확증이 없다. 삼성전자 CF 40행을 덤프해서 실제 ID를 확정하고 **무형자산 취득 포함 여부를 결정**해야 한다. 결과는 클라이언트 확인 필요.

**완료 판정** — `pnpm vitest` 전부 통과:

| 케이스 | 기대 |
|---|---|
| 삼성전자 2024 매출 | `300870903000000` · HIT `ifrs-full_Revenue` @IS |
| **KB금융 2024 매출** | `NO_ROW` → `displayState: NOT_IN_PROFILE` |
| **헬릭스미스 EPS** | 1차 `BasicEarningsLossPerShare` `NO_ROW` → 2차 `...FromContinuingOperations` HIT `-329` |
| 카카오 손익 | `sjDiv: "CIS"` (IS 0행) |
| **삼성전자 2024 4Q 매출** | `75788269000000` |
| 앱클론 | `fsDiv: "OFS"` · `fsDivFallbackApplied: true` |
| `"#########"` / `""` / `"-"` | 전부 `null` |
| 카카오 배당성향 | `-26.858` 정상 수신 + 화면 방어 플래그 |

**규모** 1.5일 (~600 LOC + 테스트) · **선행** T3

---

### T5 — SourcePanel (collapse) ★ 사용자 요구사항

**목표** 모든 차트 밑에서 "이 숫자가 어디서 어떻게 나왔는가"를 추적한다.

**구현** `<details>` / `<summary>` 사용 — **JS 0으로 collapse 동작**, RSC 친화적. 내부에 클라이언트 컴포넌트를 넣어 `onToggle` 최초 발생 시에만 원본을 lazy fetch.

**탭 5개**

| 탭 | 내용 |
|---|---|
| **요청** | 마스킹된 URL · `status 000` · 390행 · 206,099 bytes · 0.31s · fetchedAt |
| **원본 JSON** | 전체 응답(lazy). **사용된 행만 하이라이트** + "사용된 행만 보기" 토글. 390행이므로 가상 스크롤 고려 |
| **폴백 이력** | `1) ifrs-full_Revenue @IS → NO_ROW`<br>`2) ifrs-full_Revenue @CIS → NO_ROW`<br>`→ 미존재. 금융 프로필이므로 순이자손익으로 대체` |
| **정규화** | `"12830000000000"` → `12,830,000,000,000원` → `128,300억원` · 단위 KRW · 기준 연결(CFS) · `account_id` · `sj_div` · `ord` |
| **파생 계산식** | `Q4매출 = 300,870,903,000,000 − 225,082,634,000,000 = 75,788,269,000,000` · parserVersion |

**"지금 다시 호출" 버튼** — `/api/dart/probe`로 라이브 호출 후 스냅샷과 비교:
- `일치` (녹색) / `상이 — 필드 N개 변경` (주황, diff 표시)

`<summary>`에 목업 `.srcfoot` 스타일 요약 한 줄:
```
출처 DART 사업보고서 · 기준 연결 · 기준일 2025.03.11 · 파서 v1 · 원문 보기 ›
```

**완료 판정**
- 5탭 전부 채워짐
- 마스킹된 URL을 복사해 키만 넣으면 동일 응답 재현 가능
- "지금 다시 호출" 클릭 시 라이브 응답 도착 + 일치 판정
- 초기 HTML에 원본 JSON이 **없음** (View Source 확인)

**규모** 1일 · **선행** T4

---

### T6 — 차트 프리미티브 이식

**목표** 목업 프리미티브가 React 컴포넌트로 존재하고 목업과 육안 일치한다.

**작업**
- `globals.css`에 목업 `:root` 토큰 이식 + Pretendard CDN + `font-feature-settings:'tnum'`
- 목업 CSS 버그 2건 수정 (§4 참조)
- 차트 팔레트 토큰화

**프리미티브 8종**

| 컴포넌트 | 목업 근거 | 용도 |
|---|---|---|
| `<PnlWaterfall>` | `.wf/.wfrow` | 표준 프로필 손익 구조 |
| `<QuarterBars>` | `.qbrow/.qbfill.prov` | 분기 실적 · **4Q 역산 dashed** |
| `<ZeroAxisBars>` | `.zbrow/.zbtop/.zbbot` | 적자 종목 순이익 |
| `<GroupedBars>` | `.bars/.bar-a/.bar-b` | 매출+영업이익 2계열 |
| `<CashFlowDiverging>` | `.flowrow/.fill.pos/.neg` | 영업·투자·재무 CF + FCF |
| `<LineChart>` | `<polyline>` + `stroke-dasharray` | EPS · 이익률 추이 |
| `<PieChart>` | `<path>` arc | 자산·부채 구성 |
| `<StackedBar100>` | — | 금융 순영업수익 구성 |

전부 서버 컴포넌트 (`"use client"` 없음).

**`<MetricValue>`** — `displayState` 6종 **단일 렌더링 진입점**:
```
OK                    1,234억원 [연결]
ZERO_BY_FACT          0원 [무배당 확인] [T1]
MISSING               데이터 없음  (회색)
NA_NEGATIVE_BASE      N/A [분모 음수]
NOT_IN_PROFILE        해당 없음 [금융 프로필]
SOURCE_NOT_AVAILABLE  원천 미확보 [DART 미제공]
```

포맷: **억 단위**, 3자리 콤마, 증감률 소수 1~2자리, 비율 증감은 `%p`, 배수는 `배`.

**완료 판정**
- `/kitchen-sink`에 8종 + `MetricValue` 6상태 전부 렌더
- 목업 HTML을 옆 탭에 띄우고 육안 대조 시 색·간격·서체 일치
- 클라이언트 JS 번들에 차트 코드 **0바이트**

**규모** 1.5일 · **선행** T0 (T4·T5와 병렬 가능)

---

### T7 — ★ 프로필 엔진 + 삼성전자 vs KB금융

**이 태스크가 프로토타입의 존재 이유다.**

**목표** 김예지의 *"비금융 공통 ≠ 모든 종목 공통"*을 **실제 API 값으로** 한 화면에서 증명.

**`profiles.ts` 카탈로그**

```
STANDARD 손익:
  revenue        [ifrs-full_Revenue]                            @IS,CIS
  gross_profit   [ifrs-full_GrossProfit]                        @IS,CIS
  operating_inc  [dart_OperatingIncomeLoss,
                  ifrs-full_ProfitLossFromOperatingActivities]  @IS,CIS
  net_income     [ifrs-full_ProfitLoss]                         @IS,CIS,CF

FIN_HOLDING / FIN_BANK 손익 (후보 — 존재하는 것만 표시):
  net_interest_income   [ifrs-full_InterestRevenueExpense]
  interest_revenue      [ifrs-full_RevenueFromInterest]
  net_fee_income        [ifrs-full_FeeAndCommissionIncomeExpense]
  insurance_result      [dart_InsuranceRevenueExpense]
  insurance_revenue     [ifrs-full_InsuranceRevenue]
  credit_loss_allowance [dart_AdditionReversalOfCreditLossFinancialAssets]
  operating_inc         [ifrs-full_ProfitLossFromOperatingActivities]
  net_income            [ifrs-full_ProfitLoss]

FIN_* 안정성 (전부 sourceAvailable: false — DART 미제공):
  bis_ratio · npl_ratio (은행·지주) / ncr (증권) / kics (보험)
```

**화면 — 좌우 2단**

| 좌 · 삼성전자 `STANDARD` | 우 · KB금융 `FIN_HOLDING` |
|---|---|
| `<PnlWaterfall>` 매출→매출총이익→영업이익→순이익 | **워터폴 없음.** `<StackedBar100>` 순이자손익 12.83조 / 순수수료손익 3.85조 |
| 영업이익률 표시 | 매출·매출총이익·영업이익률 자리에 `해당 없음 [금융 프로필]` |
| collapse: "후보 4개 중 4개 존재" | BIS·NPL 자리에 `원천 미확보 [DART 미제공]` |
| | collapse: **"후보 8개 중 5개 존재 / 3개 미존재"** + `ifrs-full_Revenue` 2회 시도 전부 `NO_ROW` |

하단에 **고정 스키마 vs 프로필 스키마 대조표** — 좌우가 왜 다른 컴포넌트로 렌더됐는지 자료구조를 그대로 노출.

**완료 판정**
- 좌우 숫자 전부 실제 API 값 (**하드코딩 0**)
- KB금융 순이자손익 12.83조 / 순수수료손익 3.85조 (명세 실측치 일치)
- **우측에 매출·매출총이익·영업이익률 막대가 하나도 그려지지 않음**
- KB collapse에 `ifrs-full_Revenue @IS → NO_ROW` / `@CIS → NO_ROW` 노출
- `profiles.ts` 한 파일만 고치면 표시 지표가 바뀜 (컴포넌트 수정 불필요)

**규모** 1.5일 · **선행** T4 · T5 · T6

---

### T10 — 20종목 리스트 + 종목 상세

**목표** 20개 전부 크래시 없이 열리고, 프로필에 따라 화면이 달라진다.

프로토타입이므로 **새로 만드는 것은 없다** — T4의 데이터, T6의 프리미티브, T7의 프로필 엔진을 20종목에 반복 적용하는 조립 태스크다.

**작업**
- `/` — 20종목 카드 리스트
  - 프로필 배지 (표준 / 금융·지주 / 금융·증권 / …)
  - 매출(또는 금융은 순이자손익) 스파크라인
  - **커버리지 %** — 프로필 후보 지표 중 몇 개가 `HIT`인지
- `/stock/[code]` — 종목 상세. 공통 7섹션을 프로필별로 분기 렌더
  1. **개요** — `company.json` 개황 (대표·업종·결산월·시장)
  2. **손익** — 표준: 워터폴 + 분기 막대(4Q dashed) / 금융: 100% 스택
  3. **재무상태** — 자산·부채·자본 파이 + 유동/비유동
  4. **현금흐름** — 발산 막대 + FCF
  5. **수익성** — ROE(API) · ROA(계산) · 이익률, `MetricValue`로
  6. **안정성** — 표준: 부채비율·유동비율 / 금융: `SOURCE_NOT_AVAILABLE` 표시
  7. **주주환원** — EPS · DPS · 배당성향(fallback 포함) · 자기주식
- 결측은 **반드시** `데이터 없음`. 근거 없는 0 채우기 절대 금지
- 모든 차트에 T5 SourcePanel 부착
- 적자 종목(헬릭스미스·신라젠)은 `<ZeroAxisBars>` + `N/A [분모 음수]` 자동 적용

**완료 판정**
- **20개 URL 전부 200, 콘솔 에러 0** — 이게 이 태스크의 본질. 함정 종목(EPS 행 없음, CIS만, OFS 전용, 무배당)이 전부 크래시 없이 렌더되면 정규화 엔진이 검증된 것
- 카드마다 커버리지 % 표시. **금융 종목이 비금융보다 낮게 나오는 것이 정상**
- 어떤 숫자에도 근거 없는 0이 없음
- 모든 차트에 collapse 존재

**규모** 1.5일 (T7 산출물 재사용 전제) · **선행** T7

> 프로토타입 간소화로 잘라낸 것: 기간 토글(연간/분기 전환), YoY/QoQ 탭, 동종업종 비교, 검색. 화면당 최신 연도 고정이면 충분하다.

---

## 9. 일정

| 묶음 | 태스크 | 산출 | 누적 |
|---|---|---|---|
| 1 | T0 · T1 · T2 | 실제 호출 원본이 보이는 `/debug` + 유니버스 20행 | 1.5일 |
| 2 | T3 · T4 | 스냅샷 470건 + 폴백 리포트 + 테스트 통과 | 3.5일 |
| 3 | T5 · T6 | collapse 완성 + 프리미티브 8종 | 6일 |
| 4 | **T7** | **삼성 vs KB — 핵심 증명** | **8일** |
| 5 | T10 | **20종목 리스트 + 종목 상세** — 약속한 "20종목 그래프" 완성 | 9.5일 |

**T7이 크리티컬 패스다.** 일정이 밀리면 우선순위는 **T7 > T10 > T6 프리미티브 축소(8종 → 5종)** 순으로 지킨다. T10은 T7의 조립 반복이므로 T7이 견고할수록 빨라진다 — T7에서 밀린 시간을 T10에서 만회하려 하지 말 것.

---

## 10. 통합 검증

1. `pnpm snapshot:fetch --dry-run` → 호출 계획만 출력, DART 미접촉
2. `pnpm snapshot:fetch` → 470회 완료, 폴백 리포트에 앱클론 등 명시
3. `pnpm vitest` → T4 케이스 8종 전부 통과 (특히 삼성 4Q `75788269000000`, KB `NOT_IN_PROFILE`, 헬릭스미스 폴백)
4. `pnpm dev` 후 브라우저
   - `/debug` — 삼성전자 213행 · 앱클론 CFS `013` → OFS 118행
   - `/universe` — 20행 · 금융 7/비금융 13 · 결산월≠12 최소 1건
   - `/kitchen-sink` — 프리미티브 8종 + MetricValue 6상태
   - `/compare/pnl` — **우측 KB금융에 매출 막대 없음** · collapse에 `NO_ROW` 2회 기록
   - `/` + `/stock/[code]` — **20개 URL 전부 200 · 콘솔 에러 0** · 커버리지 %가 금융 < 비금융
   - `/stock/084990` (헬릭스미스) — EPS가 폴백 체인으로 표시 · 배당 `0원 [무배당 확인]` · PER 자리 `N/A`
5. View Source — 초기 HTML에 원본 JSON 없음 · `crtfc_key` 없음
6. `git status` — `.env.local` 미추적

---

## 11. 데모 시나리오 (5분)

1. `/universe` — 20종목, **손익구조 컬럼** → *"모든 종목 공통이 아니라 비금융 공통"*
2. `/compare/pnl` — **삼성 vs KB (핵심)**
3. 아무 차트 collapse 펼침 → **"지금 다시 호출"** → 진짜 API임을 증명
4. `/` → 아무 종목이나 클릭 → `/stock/[code]` — **약속한 "20종목 그래프"**. 특히 헬릭스미스(적자·무배당·EPS 폴백)를 열어 함정 처리를 시연
5. (다음 주) `/rules` 처리규칙 5종 · `/gaps` 못 얻는 것

---

## 12. 범위 밖 (다음 주)

| | 내용 |
|---|---|
| T8 | 삼성증권 vs NH투자증권 계정 diff — 양준호 이슈 실증 |
| T9 | 처리규칙 5종 가시화 — 4Q역산 · 적자N/A · 무배당0 · 연결별도 · 비12월결산 |
| T11 | **갭 리포트** — DART로 못 얻는 것 (사업부문 매출 · BIS · NCR · K-ICS · PER/PBR) |
| T12 | 배포 (`vercel deploy` CLI 직접 업로드) |

> T10(종목 상세)은 이번 주 범위로 편입됐다 (§8 참조). T10에서 잘라낸 기간 토글·YoY/QoQ 탭·동종업종 비교는 필요 시 다음 주에 T9와 묶어 진행한다.

---

## 13. 결정 필요 항목

| # | 항목 | 비고 |
|---|---|---|
| 1 | **CAPEX `account_id`** | 유형자산 취득만 vs 무형자산 포함. FCF 값이 달라진다. **T4 스파이크로 실측 후 클라이언트 확인** |
| 2 | T1/T2/T0 태그 체계 | 파생값(4Q역산·ROA)을 T1로 볼지 별도 마크할지. `T1·파생` 제안 |
| 3 | 비12월 결산 종목 선정 | T2에서 corpCode 조회 후 확정 |
| 4 | 원본 스냅샷 25MB 커밋 | 로컬 전용 저장소이므로 커밋 권장 (재현성) |

---

## 14. 리스크

**R1 · 프로토타입이 "DART 잘 붙었네"로만 읽힘**
가장 큰 리스크. 방어: 데모를 `/universe` → `/compare/pnl` → collapse 순으로 배치. **"우리가 못 하는 것"을 먼저 정확히 말하는 쪽이 신뢰를 더 얻는다.**

**R2 · 금융 종목 계정 체계가 실측과 다름**
명세에 실측된 금융사는 **KB금융 하나뿐**이다. 증권·보험 4종은 미검증. **T3 직후 금융 5종의 손익 계정을 즉시 덤프해 눈으로 확인**하고, 다르면 `profiles.ts` 후보 배열을 그 자리에서 보강할 것. **이 확인이 T7 이전에 반드시 끝나야 한다.**

**R3 · 4Q 역산 부호 오류**
삼성전자 외 종목에서 음수가 나올 수 있다(3Q 누적 > 연간). 발생 시 `MISSING` 처리하고 collapse에 사유 노출. **억지로 그리지 말 것.**

**R4 · 20종목 중 일부 `013`**
무작위 표본에서 40%가 데이터 없음이었다. 우리 유니버스는 전부 대형 상장사라 안전하지만, T3에서 `013`이 나오면 즉시 대체 종목으로 교체.

**R5 · Vercel 함수 타임아웃**
라이브 프록시는 단건만 호출하므로 안전(0.15~0.3s). **Route Handler 안에서 절대 팬아웃하지 말 것.**

---

## 15. 구현 시 체크리스트

프로토타입 범위에서 **실제로 터지는** 함정만 추렸다. 전체 58개는 [`dart-api/README.md` §4](../../../ete-django/docs/dart-api/README.md) 참조.

- `#1` 모든 에러가 HTTP 200 → `body.status !== "000"` 판정
- `#2` `status != 000`이면 `list` 키 없음 → `body.list ?? []`
- `#4` 금액 콤마 유무가 API마다 반대 → 공통 `parseAmount`
- `#14` corpCode 비상장 `stock_code`는 공백 1개 → `.strip()` 후 판정
- `#16` `induty_code` 자릿수 가변 → **앞 2자리만**, zero-fill 금지
- `#22` `alotMatter.stock_knd` 신뢰 불가 → 행 위치 판정
- `#23` 적자 기업 배당성향 `"-"` → fallback 계산
- `#24` 무배당도 `status=000` → status로 판정 금지
- `#25` `alotMatter` 분기 코드는 기간 기준 혼재 → `11011`만
- `#27` `stockTotqySttus` `se="비고"` 행 제외
- `#32` **8사 중 5사가 IS 0행** → `sj_div in ("IS","CIS")` 폴백
- `#33` `account_nm` 회사마다 다름 → `account_id` 매칭
- `#34` `account_id`만으로도 불충분 → 폴백 체인 배열
- `#35` `ifrs-full_ProfitLoss` 3중복 → `sj_div` 우선순위 dedupe
- `#36` `-표준계정코드 미사용-` 12% → 표준화 제외
- `#37` CFS `013` → OFS 재시도 필수
- `#38` 연간에 `thstrm_add_amount` 없음 / 분기에 `bfefrmtrm_*` 없음
- `#39` 4Q 단독값 미제공 → 역산
- `#40` `idx_val` 결측 시 **키 자체가 사라짐** → `.get()` 필수
- `#41` `idx_val === "#########"` → `Number()` 전 체크
- `#42` `idx_cl_code` 콤마 다중지정 불가 → 4회 개별 호출
- `#46` 금융업 매출·영업이익 계정 다름 → 프로필 분기
- `#47` 금융업 지표 66→34개, 값 있는 건 18개

---

## 참조

| 문서 | 용도 |
|---|---|
| [`dart-api/README.md`](../../../ete-django/docs/dart-api/README.md) | 함정 58개 · status 처리 · 백필 전략 — **T1·T3·T4 기준** |
| [`dart-api/ds003-financials.md`](../../../ete-django/docs/dart-api/ds003-financials.md) | §1.5 계정명 불일치 실측표 · §1.6 금융업 손익 구조 · §1.8 4Q 역산 검산 — **T4·T7 직접 근거** |
| [`dart-api/ds002-periodic-reports.md`](../../../ete-django/docs/dart-api/ds002-periodic-reports.md) | `alotMatter` 15행 인덱스 규약 · 무배당/적자 케이스 — **T4 근거** |
| [`dart-api/ds001-disclosure.md`](../../../ete-django/docs/dart-api/ds001-disclosure.md) | `company.json` 필드 · corpCode ZIP 처리 · KSIC 앞2자리 — **T2 근거** |
| [`dart-api/indicators.md`](../../../ete-django/docs/dart-api/indicators.md) | 지표 66개 · ROA·영업이익률 미제공 확정 — **T4 자체계산 목록** |
| [`dart-api/schema-monitoring.md`](../../../ete-django/docs/dart-api/schema-monitoring.md) | 카나리 설계 — **T5 "지금 다시 호출"의 근거** |
| `../../../ete-django/docs/goals-in-2months/이띠_R1_배포앱_목업_6.html` | 프리미티브 16종 · `:root` 토큰 · `.srcfoot` — **T6 CSS 직접 이식** |
| [도메인 입문서 (Artifact)](https://claude.ai/code/artifact/41b656d6-b3d4-49c7-af00-1ad56806fa7c) | 용어 학습 — 신규 투입 인원 온보딩용 |
