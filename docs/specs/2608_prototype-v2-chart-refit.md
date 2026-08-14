# 프로토타입 v2 — 차트 중심 개편

**상태** 계획 확정 · 구현 미착수
**작성일** 2026-08-12
**선행** [`2608_prototype-plan.md`](./2608_prototype-plan.md) (v1 — T0~T7·T10 완료, main 병합)
**실행 방식** v1과 동일하게 subagent-driven development

---

## 1. 왜 바꾸는가

### 클라이언트가 차트 스펙을 승인했다

슬랙 `#pj-외부-이띠`, 2026-08-12 오전 확정. PM 이주호가 8/11 제안한 차트 구현 방식에 김예지 연구원이 *"차트 표시부분은 이견없습니다. 진행 부탁드립니다"*:

| 대상 | 차트 |
|---|---|
| **금액 추이** (매출·영업이익·순이익·**EPS** 등) | **분기별 막대** |
| **성장률·비율 추이** (QoQ·YoY·ROE·부채비율 등) | **꺾은선** |
| **재무상태** (자산=부채+자본) | **누적 막대** |
| **현금흐름** (영업/투자/재무) | **상하(±) 막대** |

공통 규칙 (승인문 그대로): **손실 분기는 기준선 아래** / **잠정치는 점선**, 확정 시 자동 갱신 / **적자 기업 PER 등은 N/A** / **배당 0원과 데이터 없음 구분**.

### 스코프 확정 (같은 스레드)

- **전 종목(금융 포함) 8주 내 구현·배포.** 금융은 *작업 순서만* 마지막 (김예지, 8/12 12:00 — PM의 "비금융 먼저 배포" 해석을 정정)
- 금융/비금융 분리는 데이터 수집 오류 방지용 개념 구분
- 오버레이·부문별 지표의 그래프 형태는 이띠가 내부 논의 후 송부 예정 — 이번 범위에서 대기

### 양준호 xlsx가 금융 차트를 지정했다

`금융업 발라내기.xlsx` · **"FS-Q(차트 여기 보세요)"** 시트 (KB금융 예시, 분기별, 한경에이셀 데이터):

- 영업이익 추이 · **순이자손익(이자수익−이자비용)** · 순수수료손익(수수료수익−수수료비용) · 보험손익(보험수익−보험비용) · **지배주주 당기순이익** 추이 · 기본주당이익(EPS) 추이 · **연간(YoY)·분기별(QoQ) 성장률**
- BIS비율 추이는 "다트 참조: 5. 재무건전성 등 기타참고사항" = 사업보고서 **원문 섹션** — DART API 미제공이라는 우리 실측과 정합

> ⚠️ xlsx의 순이자손익 정의(이자수익−이자비용)가 우리가 쓰는 순액 계정(`ifrs-full_InterestRevenueExpense`)과 값이 같은지 **T1V에서 교차검증**. 불일치면 클라이언트 확인 안건.

### 시점 현행화 — 지금은 2026년 8월이다

화면의 "2024 고정"은 낡았다. FY2025 연간(2026-03 제출)은 스냅샷에 이미 있고, **2026 1Q(11013, 5월 제출)는 미수집**. 2026 반기(11012)는 8/14 마감이라 대부분 미제출(`013` 정상 처리).

### 사용자(개발 리드) 지시

- 유니버스·비교(compare/pnl)·디버그 페이지 **삭제**
- EPS 차트 추가 · 성장률·비율 꺾은선 추가 · 재무상태 누적 막대
- **7개 셋 전부에 그래프** — 참고: `../../../ete-django/docs/goals-in-2months/이띠_데이터항목_학습가이드.html` (차트 문법 "금액=막대, 비율·성장률=꺾은선" · SET5 부채비율 기준선 100% · SET6 EPS 막대에 배당 겹침)
- 목업(`이띠_R1_배포앱_목업_6.html`)은 **UI 스타일 참고용만**
- **PWA 언급 완전 무시** — 반응형 웹 유지, 별도 작업 없음

---

## 2. 현재 상태 (탐색 실측, 2026-08-12)

- 저장소 main 병합 완료 · 테스트 81개 통과 · 스냅샷 467건
- 스냅샷은 **11011(연간)·11014(3Q)만** — 분기 시계열 불가(Q4 역산 1점만). `scripts/snapshot-fetch.ts:68-77` 매트릭스는 데이터 주도 상수 (확장 = 상수 수정)
- **`lib/normalize/engine.ts`는 reprt_code 리터럴 하드코딩 5곳** (:56-57, :67, :81, :85, :92) — 분기 축 도입의 핵심 개편 지점
- `derived.json` 스키마: `stocks[].years[]`(연간만) · **QoQ/YoY 계산 전무**(grep 0건) · ROE·부채비율 연간 3개년 59/60 존재 → 연간 꺾은선 즉시 가능
- 차트 컴포넌트 제약:
  - `LineChart` — 실데이터 미연결(킷친싱크 데모만) · 기준선 없음 · min-max 자동 스케일이라 0선/음수 표현 불가 · 색 고정
  - `StackedBar100` — 100% 정규화 전용(양수만, total 주입 불가) → 절대값 누적 불가
  - **`QuarterBars` — `Math.abs` 스케일이라 음수를 위로 그림** → "손실은 기준선 아래" 승인 규칙과 정면 충돌, 종목 페이지에서 퇴역
  - `ZeroAxisBars`(세로 0축, 음수 지원) 존재 — 분기 금액 막대의 기반
- `/stock/[code]` 7섹션 중 **⑤수익성·⑥안정성·⑦주주환원 차트 0개** · ③재무상태는 PieChart
- 연도 하드코딩: `stock/[code]/page.tsx:40` `YEAR="2024"` · non-null 단언 :266·:557 · `app/page.tsx:58` · FieldRow가 모듈 상수 캡처(:117)
- DART 분기 규약(v1 명세 실측): **Q1=`11013.thstrm` / Q2=`11012.thstrm` / Q3=`11014.thstrm` / Q4=`11011.thstrm − 11014.thstrm_add`**. 분기 응답 키셋은 연간과 다름(`thstrm_add_amount` 있음, `bfefrmtrm_*` 없음). `resolveAcntAllField`는 행 단위라 분기에 재사용 가능
- 금융 확장 카탈로그(fin-*-catalog.ts)는 요청 시점 병합(`resolveProfileExtras`) — derived.json에 없음
- 비12월 결산 1종목(신영증권, 3월 결산)

## 3. 컨트롤러 확정 사항 (설계 열린 결정 4건)

| 결정 | 채택 | 근거 |
|---|---|---|
| 흑자/적자전환 표현 | **`DisplayState`에 `TURN_TO_PROFIT`·`TURN_TO_LOSS`·`LOSS_CONTINUED` 3종 추가** | union 확장이 컴파일 에러로 전 사용처(MetricValue·resolveDisplay)를 강제 노출 |
| QoQ 노출 범위 | 영업이익 QoQ 꺾은선 1개 (학습가이드 c1b 스타일) | YoY가 주, QoQ는 보조 — 화면 과밀 방지 |
| 재무상태 축 | 연간 3개(FY23~25) + 최신 분기말 1개(2026 1Q, 잠정) | BS는 시점 데이터라 분기말 직독 가능 |
| 신영증권 분기 라벨 | 보고서명 기준(`FY2025 1Q` 형식) + 기존 비12월 badge 유지 | 달력 환산 라벨은 오해 소지 |

---

## 4. 태스크 그래프

```
T0 페이지·내비 정리 ──────────────────────────────────┐
T1 수집 확장 ─ T1V 분기응답 스파이크 ─ T2 분기 축+QoQ/YoY ─┼─ T5 표준 7섹션 ─ T6 금융 분기 ─ T7 회귀
T3 차트 컴포넌트 확장 ─────────────────────────────────┘
T1 ─ T4 연도 현행화 ──────────────────────────────────┘
```

T0·T1·T3은 상호 독립 (순차 실행 시 T1 먼저 — 스냅샷이 T1V의 입력). 금융(T6)은 클라이언트 확정대로 마지막.

---

## T0 — 페이지·내비 정리

**목표** 유니버스·비교·디버그 제거, 차트 중심 내비.

- 삭제: `app/universe/` · `app/compare/` · `app/debug/`(page + source-panel)
- `app/layout.tsx` `NAV_LINKS` → `종목(/)` · `킷친싱크(/kitchen-sink)` 2개
- **유지**: `app/api/dart/probe`(SourcePanel "지금 다시 호출" 의존) · `lib/sourcePanelHelpers.ts` · `lib/normalize/resolveFinHoldingExtras.ts`(테스트 의존)
- 삭제 페이지 전용 CSS Module·dead import 정리 · README 데모 동선 갱신

**검증** `pnpm build` 통과(라우트 감소) · 삭제 경로 404 · `/stock/*` probe 왕복 정상 · vitest 81 무변
**규모** 반나절 · **선행** 없음

## T1 — 분기 스냅샷 수집 확장 + `--refetch-nodata`

**목표** 분기 원본 확보. 상수 확장이 전부 — 루프 코드 무수정.

- `scripts/snapshot-fetch.ts`: `YEARS = ["2023","2024","2025","2026"]` · `ACNT_ALL_REPRT_CODES = ["11013","11012","11014","11011"]` (2023 분기 포함 이유: 2024 분기 YoY 분모)
- indx / stockTotqy / alotMatter 매트릭스 **불변** (연간 유지 — alotMatter는 이미 FY2025 커버)
- 콜 산정: acntAll 20종목×4년×4reprt = 320 조합 − 기존 캐시 120 → **신규 ~200 + OFS 폴백 ≈ 215콜** (일일 한도의 ~1.1%, 약 10초). 2026의 11014·11011·11012 다수가 `013` — 정상 저장
- **`--refetch-nodata` 플래그 신설**: 캐시가 `status "013"`인 job만 재호출 (`000`은 절대 재호출 금지). 용도 — ① 2026 반기 8/14 마감 후 재수집 ② FY2025 제출 전에 수집된 낡은 013(신영증권 연간 등) 갱신
- 실행 순서: `--dry-run` 산정 검증 → 실제 수집 → manifest 집계 보고

**검증** dry-run 건수=산정치 · manifest에 11013/11012 등재 + 2026 013 분포 · 키 평문 0 · vitest 81 무변
**규모** 반나절 · **선행** 없음 (`.env.local` 키 사용)

## T1V — 분기 응답 검증 스파이크 (T2 착수 게이트)

수집된 실스냅샷으로 판정 후 T2 브리프 확정:

1. 분기 응답 키셋 (`thstrm_add_amount` 유무 — v1 명세와 대조)
2. **CF(현금흐름표)가 분기 응답에서 누적인지 단일 분기인지** ← 최대 불확실. 누적이면 분기 CF = `누적(당) − 누적(직전)` 차분 필요
3. `eps_basic` 행이 분기에도 존재하는지
4. 금융 확장 계정(순이자손익 등)의 분기 존재 — KB금융 샘플
5. 신영증권(3월 결산)의 bsns_year·분기 의미 실측
6. **양준호 정의 교차검증**: "순이자손익 = 이자수익−이자비용" vs `ifrs-full_InterestRevenueExpense` 값 일치 여부 — 불일치면 보고

**산출물** 판정 노트 + T2 테스트 픽스처 지정
**규모** 2시간 · **선행** T1

## T2 — 정규화 분기 축 + QoQ/YoY (최대 리스크)

**스키마 결정: `years[]` 불변 + `stocks[].quarters[]` 추가 (additive).** 근거: 81개 테스트와 전 화면이 `years[]`를 쓰므로, 분기를 별도 축으로 더하면 기존 테스트가 그대로 회귀 안전망이 된다.

- `quarters[]` 원소: `{period:"2024Q1", bsnsYear, quarter, reprtCode, fsDiv, fsDivFallbackApplied, resolutions}` · derived.json 최상위 `quarters` 목록 · `PARSER_VERSION` 범프
- `engine.ts`: acntAll 경로(:56-57, :67)를 `resolveFromReport(dir, stock, year, reprt)`로 공통화 + `resolveStockQuarter()` 신설. indx·alotMatter·stockTotqy 리터럴은 유지(연간 전용 사실과 일치). fsDiv는 분기도 CFS→OFS 폴백 동일
- 분기 값 규약: Q1/Q2/Q3 = 각 보고서 `thstrm` 직독 · **Q4 = 연간−3Q누적**(`deriveQ4` 일반화). 대상 — 흐름 키: revenue·operating_income·net_income·net_income_attributable_to_owners·eps_basic / BS 키: 각 보고서 thstrm 직독(시점) / CF: T1V 판정 따름. **EPS Q4 역산은 가중평균주식수 때문에 부정확 → 항상 잠정 플래그 + derivation 주석**
- **QoQ/YoY derive 신설**: 분모>0 → % · 분모≤0 → `TURN_TO_PROFIT`/`TURN_TO_LOSS`/`LOSS_CONTINUED`. `qoq_*`/`yoy_*` 키로 quarters[].resolutions에 저장, derivation 문자열 관행 유지
- 금융 확장: `resolveFinExtras`/`finExtrasAcntAllRequestId`에 `reprt` 파라미터 추가 (기본 `"11011"` — 기존 호출 무변)
- 분기 조립은 데이터 주도 (`000`인 조합만 값, 아니면 MISSING) — UI가 "값 있는 최근 N분기" 윈도를 자름

**검증** 기존 81개 **무수정 통과** + 신규: 삼성 2024 Q1+Q2+Q3+Q4=연간 검산 · 013→MISSING(2026 반기) · 전환 상태 4분면 · 신영증권 분기 · fin extras 분기(KB) · EPS Q4 잠정 플래그
**규모** 1.5~2일 · **선행** T1V

## T3 — 차트 컴포넌트 확장

전 컴포넌트 공통: 서버 컴포넌트 · null="—"(근거 없는 0 금지) · CHART_PALETTE 토큰 · 번들 0KB.

| 컴포넌트 | 작업 | 근거 |
|---|---|---|
| `ZeroAxisBars` **확장** | `provisional`(점선)·`unit`·컴팩트 라벨 prop | 분기 금액 막대의 표준. QuarterBars는 abs 스케일이라 "손실 아래" 위반 → 종목 페이지 퇴역 |
| `LineChart` **v2** | `baseline:{value,label}`(도메인 포함 보장)·`color`·null/전환 구간 선 끊기+텍스트 칩 | 성장률 0선 · 부채비율 100% 기준선. 옵셔널 prop이라 하위호환 |
| `StackedBarsAbs` **신설** | 세로 절대값 누적(자본+부채=자산 높이), 다기간 | StackedBar100은 100% 정규화 전용 — 확장하면 둘 다 오염 |
| `OverlaidBars` **신설** | EPS 0축 막대 + DPS 오버레이 | SET6 겹침. ZERO_BY_FACT(0높이+"무배당" 칩) vs null("—") 계약 명시 |
| `SignedGroupedBars` **신설** | n계열 0축 그룹 막대 | 현금흐름 ± 다기간. GroupedBars는 2계열 양수 전용 |

킷친싱크에 5종 데모 추가(하드코딩 허용 구역). PieChart 컴포넌트는 존치, 종목 페이지에서만 제거.

**검증** `/kitchen-sink` 5종 렌더 · 음수 막대가 기준선 아래 · 기준선 100% 도메인 포함 · 번들 grep 0 · vitest 무변
**규모** 1.5일 · **선행** 없음 (T5 전 완료)

## T4 — 연도 현행화

- `lib/period.ts` 신설: `LATEST_ANNUAL_YEAR = "2025"` · 최신 분기 라벨 단일 정의
- `stock/[code]/page.tsx`의 YEAR·2024 단언(:266,:557)·`app/page.tsx:58` 치환 · FieldRow/TraceOnly의 모듈 상수 캡처는 **prop화**
- 헤더: `기준연도 2025 · 최신 분기 2026 1Q(잠정)` · 신영증권 비12월 badge 유지
- 신영증권 FY2025 연간(2026-06 제출)은 T1 `--refetch-nodata`로 확보 시도 — 없으면 MISSING 정직 표기

**검증** 화면 전체 "2024(고정)" 문구 0건 · LG화학 상세가 FY2025 값 렌더 · 20/20 빌드
**규모** 반나절 · **선행** T1 (rebuild 후)

## T5 — 표준 프로필 7섹션 차트 매핑

| 섹션 | 차트 | 데이터 |
|---|---|---|
| ② 손익 | 워터폴(FY2025) 유지 + **분기 막대 4개**(매출·영업이익·순이익(지배)·**EPS**) + **YoY 꺾은선**(매출·영업이익, baseline 0) + 영업이익 QoQ 꺾은선 1개 | 최근 8분기 윈도(~2026 1Q), Q4 역산·최신 분기 잠정 점선 |
| ③ 재무상태 | PieChart → **StackedBarsAbs** | FY23~25 + 2026 1Q말(잠정) |
| ④ 현금흐름 | **SignedGroupedBars** | 연간 FY23~25 (분기 CF는 T1V 판정 통과 시 후속 태스크) |
| ⑤ 수익성 | **ROE 꺾은선** + 영업이익률 꺾은선, ROA 병기 | 연간 3개년 (indx 59/60 확보) |
| ⑥ 안정성 | **부채비율 꺾은선 + baseline 100%** | 연간 3개년, 나머지 지표 나열 유지 |
| ⑦ 주주환원 | **OverlaidBars EPS+DPS** | 연간 3개년 (dps_common 확보) |
| 밸류에이션 스트립 | 유지 (`원천 미확보 [주가 미연동]`) | 적자 PER N/A 규칙은 시세 연동 시점 주석 |

모든 신규 차트에 SourcePanel 부착 (분기 requestId는 해당 reprt 스냅샷).

**검증** 삼성전자 7섹션 전부 차트 존재 · 헬릭스미스 적자 분기 기준선 아래 · 전환 칩 렌더 · 배당 0원 vs 데이터 없음 구분 · 20/20 · 하드코딩 수치 0
**규모** 1.5~2일 · **선행** T2·T3·T4

## T6 — 금융 프로필 분기 차트 (양준호 xlsx 목록)

- 대상 6종 전부 **분기 막대 + YoY/QoQ 꺾은선**: base 3종(operating_income·net_income_attributable_to_owners·eps_basic)은 quarters[]에서, fin 3종(net_interest_income·net_fee_income·insurance_result)은 reprt 파라미터화된 `resolveProfileExtras`로 요청 시점 resolve. Q4 = 연간 extras − 3Q 누적 extras
- 프로필별 부재 항목(증권의 보험손익 등)은 기존 NOT_IN_PROFILE 게이팅이 자동 제외
- StackedBar100 손익 구성(순액 3종+차감 구획)은 FY2025로 유지
- BIS·NCR·K-ICS: `SOURCE_NOT_AVAILABLE` 유지 + xlsx가 지목한 원문 섹션("사업보고서 5. 재무건전성")을 note에 반영

**검증** KB금융 상세에 분기 막대 6종 · 삼성증권(보험손익 자동 제외) · 신영증권(분기 013 다수 → MISSING 정직 렌더) · 20/20
**규모** 1일 · **선행** T5

## T7 — 최종 회귀 + 전체 브랜치 리뷰

- `pnpm vitest run` 전체 · `pnpm build` 20/20 · **클라이언트 승인 규칙 4종 체크리스트** (손실 아래 / 잠정 점선 / PER N/A / 배당 0 vs 없음)
- SDD 최종 전체 브랜치 리뷰 (v1과 동일 — 크로스 태스크 정합성·"조용히 틀린 숫자" 중점) + 픽스 웨이브 1회
- 브라우저 콘솔 확인 (컨트롤러 직접)

---

## 5. 참고 노트

- **PWA 언급 무시** — 반응형 웹 유지, 별도 작업 없음
- 목업은 UI 스타일 참고용만 — 토큰·간격은 v1에서 이식 완료
- DART 라이브 호출: T1에서 ~215콜 (일일 한도의 ~1.1%), `.env.local`의 `DART_API_KEY`
- 실행 후 README 데모 동선·페이지 목록 갱신 (T0·T5에 포함)
- 클라이언트 확인 안건 누적: CAPEX 정의 · 배당성향 두 기준 · KB 스택 구성 (v1) + 순이자손익 정의(T1V 결과에 따라)

## 6. 검증 (전체 통합)

1. `pnpm snapshot:fetch --dry-run` 산정 일치 → 실행 → manifest에 11013/11012 등재
2. `pnpm vitest run` — 기존 81 무수정 통과 + 신규(분기 검산·전환 상태·013 MISSING)
3. `pnpm build` — 20/20 SSG · 삭제 라우트 부재
4. 브라우저: 삼성전자(분기 막대·YoY 꺾은선·누적 막대·EPS+DPS) · 헬릭스미스(손실 아래·전환 칩·배당 0원) · KB금융(금융 분기 6종) · 신영증권(비12월·MISSING)
5. 화면 하드코딩 수치 0 · `crtfc_key` 노출 0 · 차트 번들 0KB
