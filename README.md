# 이띠 DART 프로토타입

DART 공시 원본 값을 그대로 추적할 수 있는 20종목 재무 프로토타입.
정규화 엔진(`data/derived.json`) · 출처 collapse(SourcePanel) · 프로필별(표준/금융) 손익 화면을
Next.js App Router 위에 실증한다. 전체 계획·완료판정은 [`docs/prototype-plan.md`](docs/prototype-plan.md) 참고.

---

## 1. 지금 바로 실행 (이 머신)

이 머신에는 **모든 준비가 끝나 있다** (node_modules 설치됨, `.env.local`에 DART 키 설정됨, 스냅샷 467건 커밋됨).

```bash
cd /Volumes/DYIexs/Projects/8around/itti/itti-dart-prototype
pnpm dev
# → http://localhost:3000
```

**데모 동선** (상단 헤더 네비 순서):

| 순서 | 화면 | 보여줄 것 |
|---|---|---|
| 1 | `/universe` | 20종목 + **손익구조 컬럼** — "모든 종목 공통이 아니라 비금융 공통" |
| 2 | `/compare/pnl` ★ | 삼성전자(워터폴) vs KB금융(스택+차감 구획) — 우측에 매출 막대가 **없는 게 정상** |
| 3 | 아무 수치의 `원문 보기 ›` | collapse 5탭 → **"지금 다시 호출"** → 라이브 DART 대조 「일치」 배지 |
| 4 | `/` → 종목 클릭 | 20종목 상세. 특히 **LG화학**(지배주주 적자 −6,909억) · **헬릭스미스**(EPS 폴백·무배당 0%·적자 N/A) |
| 5 | `/kitchen-sink` | 차트 프리미티브 8종 + 6가지 데이터 상태 표기 |

프로덕션 모드로 보려면: `pnpm build && pnpm start` (동일 포트).

## 2. 새 머신 / 팀원 온보딩

```bash
# 사전 요구: Node 20.x 또는 22.x
corepack enable && corepack prepare pnpm@latest --activate

git clone <이 저장소>   # 현재 원격 없음 — 디렉터리 복사로 대체
cd itti-dart-prototype
pnpm install
pnpm approve-builds esbuild     # pnpm이 postinstall을 차단하므로 1회 승인 필요

# DART API 키 (필수 — https://opendart.fss.or.kr 에서 발급, 자동승인)
cat > .env.local <<'EOF'
DART_API_KEY=<40자 hex 키>
EOF

pnpm dev
```

> ⚠️ `.env.local`은 절대 커밋하지 않는다 (`.gitignore`에 포함됨).
> 키가 없어도 화면은 전부 뜬다 — 스냅샷이 커밋되어 있어서. 키는 **"지금 다시 호출"(라이브 대조)에만** 필요하다.

## 3. 스크립트 사전

| 명령 | 하는 일 | DART 호출 |
|---|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | 개발 / 빌드(SSG 29라우트) / 프로덕션 서빙 | 0 |
| `pnpm vitest run` | 테스트 81개 (실제 스냅샷 픽스처 기반) | 0 |
| `pnpm snapshot:build` | 스냅샷 → `data/derived.json` 재정규화 | **0 (오프라인)** |
| `pnpm snapshot:fetch --dry-run` | 수집 계획만 출력 | 0 |
| `pnpm snapshot:fetch` | 스냅샷 재수집 (기존 파일 스킵, `--force`로 무시) | ~447회 (일일 한도의 2.2%) |

**정규화 로직을 고칠 때**: 카탈로그·리졸버 수정 → `pnpm snapshot:build` → `pnpm vitest run`. DART를 다시 때릴 필요 없음.

## 4. 🙋 사람이 직접 해야 하는 일

에이전트가 할 수 없거나 하면 안 되는 것들이다.

### 4-1. Vercel 배포 (다음 주 T12 범위 — 클라이언트에게 URL 공유 시)

이 저장소는 **원격 push가 없으므로 Vercel Git 연동을 못 쓴다.** CLI 직접 업로드 방식이다.

```bash
pnpm dlx vercel@latest login        # ← 브라우저 인증 (사람)
cd /Volumes/DYIexs/Projects/8around/itti/itti-dart-prototype
pnpm dlx vercel link                # 새 프로젝트로 연결 (사람이 프롬프트 응답)
pnpm dlx vercel env add DART_API_KEY production   # 키 값 입력 (사람)
pnpm dlx vercel deploy --prod       # 빌드·업로드 (이후 재배포는 이 한 줄)
```

배포 전 반드시:
- [ ] **Vercel 대시보드 → Settings → Deployment Protection 활성화** (클라이언트 외 접근 차단, 검색 인덱싱 방지)
- [ ] 배포된 URL에서 `/compare/pnl`의 "지금 다시 호출" 동작 확인 (env 키가 제대로 들어갔는지)

> 참고: 스냅샷 21MB가 `public/`에 있어 업로드가 1~2분 걸릴 수 있다. 정상이다.

### 4-2. DART API 키 재발급 (보안 — 권장)

현재 키는 개발 과정에서 채팅·슬랙 등에 노출된 적이 있다. **클라이언트 공개 전 opendart.fss.or.kr에서 재발급**하고 `.env.local`(+Vercel env)만 갱신하면 된다. 코드 수정 불필요.

### 4-3. 클라이언트 확인 3건 (다음 미팅 안건)

| # | 항목 | 현재 화면 상태 |
|---|---|---|
| 1 | **CAPEX 정의** — 유형자산 취득만 채택(무형 +4.5% 제외). FCF 값이 갈림 | ROA 등에 "(총액 기준)" 라벨로 명시 |
| 2 | **배당성향 두 기준** — DART 산출(카카오 −26.9%) vs 배당총액÷지배주주순이익(54.0%) | 상충 시 배지로 병기 중 |
| 3 | **KB 손익 스택 구성** — 순액 3개 + 차감 구획(충당금) 분리가 맞는지 | `/compare/pnl` 우측 |

### 4-4. 다음 주 범위에 필요한 발급 (미리 해두면 좋음)

- **공공데이터포털 회원가입 + 금융위 주식시세정보(15094808) 활용 신청** — 자동승인, 개발계정 10,000건/일. 밸류에이션(PER/PBR)과 주가 소급 조정 검증에 필요. 명세: `../ete-django/docs/dart-api/price-source.md`

## 5. 구조 한 장

```
app/            화면 (전부 서버 컴포넌트, 차트 JS 번들 0KB)
lib/dart/       DART 클라이언트 (status 판정·키 마스킹·허용목록 프록시)
lib/normalize/  정규화 엔진 — 원본→Resolution(폴백 이력·displayState 6종)
lib/profiles.ts 프로필 카탈로그 — 이 파일만 고치면 표시 지표가 바뀜
components/     SourcePanel(collapse)·MetricValue·charts 8종
data/           universe.json(20종목)·derived.json(정규화 결과)·manifest.json
public/snapshots/  DART 원본 응답 467건 (재현성 위해 커밋)
scripts/        snapshot-fetch / snapshot-build / resolve-corp-codes
```

관련 문서: [개발 플랜](docs/prototype-plan.md) · [DART 명세 9종](../ete-django/docs/dart-api/) · [도메인 입문(Artifact)](https://claude.ai/code/artifact/41b656d6-b3d4-49c7-af00-1ad56806fa7c)
