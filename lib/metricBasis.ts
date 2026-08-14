/**
 * 지표별 **산출 기준(근거)** 카탈로그 — `?view=basis` 탭의 내용 정본.
 *
 * ## 왜 이 파일이 필요한가
 *
 * 같은 이름의 지표라도 **분자·분모·기준시점을 무엇으로 잡느냐에 따라 값이 달라진다.**
 * 공식이 틀린 게 아니라 관점이 다른 것이라, 어느 쪽도 "오류"가 아니다. 실제로 ROE에서
 * 이 문제가 터졌다 — DART 제공값(총액 기준)과 실무·데이터벤더 표준(지배주주 기준)이
 * 종목에 따라 부호까지 갈렸고, 클라이언트 연구원이 "데이터가 이상하다"고 판단했다.
 *
 * 그래서 화면에 값만 띄우는 것으로는 부족하다. **무엇을 채택했고, 왜 그랬고, 다른 관점을
 * 택하면 어떻게 달라지는지**를 같이 밝혀야 한 번의 설명으로 끝난다.
 *
 * ## 원칙
 *
 * - `adopted`는 **지금 화면이 실제로 쓰는 정의**여야 한다. 코드와 어긋나면 이 파일이 거짓말이
 *   된다 — 계산 로직을 바꿀 때 여기도 함께 고친다.
 * - `alternatives`에는 **실제로 쓰이는 다른 관점만** 넣는다. 이론적으로 가능한 조합을
 *   나열하는 곳이 아니라, 상대가 "우리는 이렇게 본다"고 말할 법한 것만 담는다.
 * - 값이 크게 갈리는 지표는 `impact`에 **실측 사례(종목·수치)**를 적는다. 추상적인 설명보다
 *   "LG화학은 부호가 뒤집힌다" 한 줄이 훨씬 빨리 이해된다.
 */

export type BasisAlternative = {
  /** 다른 관점의 정의. */
  definition: string;
  /** 누가 이 관점을 쓰나. */
  usedBy: string;
  /** 채택안과 얼마나·어떻게 달라지는가. 가능하면 실측 사례를 적는다. */
  impact: string;
};

export type MetricBasis = {
  /** 화면 표시명. Resolution의 metricKey와 1:1이 아닐 수 있다(EPS처럼 원천이 둘인 경우). */
  label: string;
  /** 채택한 정의 — 분자 ÷ 분모, 기준시점까지 명시. */
  adopted: string;
  /** 원천: DART가 계산해 준 값인지, 우리가 계산한 값인지. */
  source: "DART 산출" | "자체 계산" | "DART 원본값" | "DART 산출 → 결측 시 자체 계산" | "DART 산출 + 자체 계산";
  /** 왜 이 정의를 골랐는가. */
  rationale: string;
  /** 다른 관점들. 없으면 생략. */
  alternatives?: BasisAlternative[];
  /** 이 지표가 관점 차이로 실제 분쟁이 났거나 날 소지가 큰가 — 화면에서 강조한다. */
  contested?: boolean;
};

export type BasisSection = {
  /** 7셋 번호와 이름. */
  title: string;
  metrics: MetricBasis[];
};

export const METRIC_BASIS: BasisSection[] = [
  {
    title: "① 손익",
    metrics: [
      {
        label: "당기순이익 — 총액 vs 지배주주",
        adopted: "차트의 주 지표는 **지배주주 귀속 순이익**(`ifrs-full_ProfitLossAttributableToOwnersOfParent`). 총액(`ifrs-full_ProfitLoss`)은 별도 항목으로 병기",
        source: "DART 원본값",
        rationale:
          "총액에는 연결 자회사의 소액주주(비지배지분) 몫이 섞여 있어 이 회사 주주의 성과가 아니다. 투자자 관점에서 의미 있는 값은 지배주주 귀속분이다.",
        alternatives: [
          {
            definition: "총액(지배 + 비지배)을 대표값으로 사용",
            usedBy: "DART 재무제표 헤드라인, 일부 요약 지표",
            impact:
              "**부호까지 갈린다.** LG화학 2024는 총액 +5,150억 흑자인데 지배주주 귀속은 −6,909억 적자, 카카오 2024는 총액 −1,619억 적자인데 지배주주 귀속은 +553억 흑자.",
          },
        ],
        contested: true,
      },
      {
        label: "4분기 단독 실적",
        adopted: "**연간(11011) − 3분기 누적(11014)** 으로 역산. 화면에 점선 + '잠정' 칩으로 구분",
        source: "자체 계산",
        rationale:
          "DART는 4분기 단독 보고서를 발행하지 않는다. 1~3분기는 각 분기보고서의 `thstrm_amount`가 이미 단일분기 값이라 역산이 필요 없고, 4분기만 차감으로 만든다.",
        alternatives: [
          {
            definition: "4분기를 표시하지 않음",
            usedBy: "DART 원문만 그대로 옮기는 화면",
            impact: "연간 흐름에서 마지막 분기가 비어 계절성·모멘텀 판단이 어려워진다.",
          },
        ],
      },
      {
        label: "성장률 (QoQ · YoY)",
        adopted: "(당기 − 전기) ÷ **|전기|** × 100. 부호가 바뀌면 수치 대신 '흑자전환'/'적자전환'",
        source: "자체 계산",
        rationale:
          "분모에 절대값을 쓰지 않으면 적자 심화가 플러스로 뒤집힌다 — 직전 −100억에서 −200억이 되면 (−200−(−100))÷(−100) = **+100%**가 되어 악화가 성장으로 보인다. 절대값을 쓰면 −100%로 올바르게 나온다.",
        alternatives: [
          {
            definition: "분모 부호를 그대로 두고 계산",
            usedBy: "단순 스프레드시트 계산",
            impact: "적자 기업 구간에서 증감 방향이 반대로 표시된다.",
          },
          {
            definition: "적자 구간을 N/A로만 처리",
            usedBy: "일부 데이터 벤더",
            impact: "적자 심화·축소 정보가 통째로 사라진다.",
          },
        ],
      },
      {
        label: "단계별 이익률 (매출총·영업·순)",
        adopted: "DART 산출지표(`M211300`·`M211200`) 우선, 결측 시 해당 이익 ÷ 매출액 × 100 자체 계산",
        source: "DART 산출 → 결측 시 자체 계산",
        rationale:
          "DART 산출값이 있으면 권위 있는 값을 그대로 쓰고, 20종목 실측상 결측이 잦아(매출총이익률 10/20) 폴백을 둔다. 어느 경로였는지는 각 지표의 계산식에 남는다.",
      },
    ],
  },
  {
    title: "② 재무상태",
    metrics: [
      {
        label: "자산 · 부채 · 자본",
        adopted: "**연결(CFS)** 기준 기말 잔액. 연결재무제표 미작성 시 별도(OFS)로 폴백하고 `[별도]` 배지 표기",
        source: "DART 원본값",
        rationale:
          "자회사를 포함한 그룹 전체 실체를 보는 것이 투자 판단의 기본이다. 폴백이 적용된 종목은 화면에서 기준이 다름을 명시한다.",
        alternatives: [
          {
            definition: "별도(OFS) 기준",
            usedBy: "모회사 단독 재무 분석, 배당 재원 판단",
            impact: "지주사는 별도 기준 자산이 연결 대비 크게 작아진다.",
          },
        ],
      },
    ],
  },
  {
    title: "③ 현금흐름",
    metrics: [
      {
        label: "FCF (잉여현금흐름)",
        adopted: "**영업활동현금흐름 − 유형자산 취득**. 무형자산 취득은 **제외**",
        source: "자체 계산",
        rationale:
          "본업을 유지하는 데 반드시 드는 지출만 차감한다는 취지다. 투자활동현금흐름 전체를 빼면 안 되는데, 거기에는 여유 현금을 예금·금융상품에 굴린 금액이 섞여 있기 때문이다 — 삼성전자 2024는 단기금융상품 순증만 32.98조로 설비투자(51.41조)에 육박한다.",
        alternatives: [
          {
            definition: "영업CF − (유형 + 무형자산 취득)",
            usedBy: "소프트웨어·제약 등 무형투자 비중이 큰 업종 분석",
            impact: "삼성전자 2024 기준 무형자산 취득 2.34조만큼 FCF가 줄어든다.",
          },
          {
            definition: "영업CF − 투자활동현금흐름 전체",
            usedBy: "단순 계산",
            impact: "삼성전자 2024는 72.98 − 85.38 = **−12.40조로 적자처럼 보인다**(실제 채택안은 +21.57조).",
          },
        ],
        contested: true,
      },
      {
        label: "CAPEX (설비투자)",
        adopted: "`ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities` (유형자산 취득) 단일 계정",
        source: "DART 원본값",
        rationale: "KRX 관행이 유형자산 기준이라 그에 맞췄다. FCF 정의와 짝을 이룬다.",
      },
    ],
  },
  {
    title: "④ 수익성",
    metrics: [
      {
        label: "ROE (자기자본이익률)",
        adopted: "**DART 산출지표 `M211550`을 그대로 사용** = 당기순이익(총액) ÷ **평균 자본총계**((기초+기말)÷2) × 100",
        source: "DART 산출",
        rationale:
          "DART가 직접 산출·공시하는 값이라 출처가 명확하고 재현 가능하다. 20종목 × 2개년 39건 중 38건에서 위 공식으로 역산 검증했다.",
        alternatives: [
          {
            definition: "**지배주주 귀속 순이익 ÷ 평균 지배주주지분** × 100",
            usedBy: "FnGuide 등 데이터 벤더, 증권사 리서치, 한국금융분석원 연구원",
            impact:
              "비지배지분이 큰 종목에서 **부호가 뒤집힌다** — LG화학 2024는 DART +1.16% vs 실무 −2.11%, 카카오는 DART −1.16% vs 실무 +0.56%, 두산에너빌리티는 3.51% vs 1.52%. 반면 삼성전자는 9.00% vs 9.03%로 차이가 없다.",
          },
          {
            definition: "분모를 평균이 아닌 **기말** 자본으로",
            usedBy: "간이 계산",
            impact: "삼성전자 2024 기준 9.00% → 8.57%로 약 0.43%p 낮아진다.",
          },
        ],
        contested: true,
      },
      {
        label: "ROA (총자산이익률)",
        adopted: "당기순이익(총액) ÷ **기말** 자산총계 × 100 — 자체 계산",
        source: "자체 계산",
        rationale:
          "DART가 주는 `M212000`은 이름이 '총자산영업이익률'로 **분자가 영업이익**이라 ROA가 아니다. 그대로 쓰면 다른 지표가 되므로 직접 계산한다.",
        alternatives: [
          {
            definition: "분모를 **평균 자산**((기초+기말)÷2)으로",
            usedBy: "ROE와 기준을 맞추는 일반적 실무",
            impact: "자산이 빠르게 늘어난 해에는 ROA가 채택안보다 높게 나온다. **ROE(평균)와 기준이 어긋나 있는 상태**라 정렬 검토가 필요하다.",
          },
          {
            definition: "분자를 지배주주 귀속 순이익으로",
            usedBy: "ROE를 지배주주 기준으로 볼 때 짝을 맞추는 경우",
            impact: "ROE 대안과 동일한 종목들에서 차이가 발생한다.",
          },
        ],
        contested: true,
      },
    ],
  },
  {
    title: "⑤ 안정성",
    metrics: [
      {
        label: "부채비율 · 유동비율 · 자기자본비율",
        adopted: "DART 산출지표(`M221100`·`M221200`·`M221000`)를 그대로 사용",
        source: "DART 산출",
        rationale: "표준화된 공시 지표라 별도 가공 없이 채택한다.",
      },
      {
        label: "순차입금",
        adopted: "**차입성 계정 15종을 전부 합산** − 현금및현금성자산 − 단기금융상품",
        source: "자체 계산",
        rationale:
          "'차입금'이 단일 계정이 아니다. 회사마다 단기차입금·유동성장기부채·사채·장기차입금·차입부채·전환사채로 쪼개고 `account_id`도 제각각이라, 첫 HIT 하나를 쓰는 폴백 체인으로는 과소 집계된다. 실제로 합산에 잡힌 계정명은 화면에 전부 노출해 검증 가능하게 했다.",
        alternatives: [
          {
            definition: "총차입금에서 현금성자산을 차감하지 않음(=총차입금)",
            usedBy: "부채 규모 자체를 보는 경우",
            impact: "삼성전자처럼 순현금 기업의 재무 여력이 드러나지 않는다.",
          },
          {
            definition: "차감 대상에 장기금융상품·단기투자자산까지 포함",
            usedBy: "현금성 자산을 넓게 보는 기준",
            impact: "순차입금이 더 낮게(순현금이 더 크게) 나온다.",
          },
        ],
        contested: true,
      },
      {
        label: "이자보상배율",
        adopted: "영업이익 ÷ 이자비용. **`ifrs-full_InterestExpense` → 없으면 `ifrs-full_FinanceCosts`(금융비용) 폴백**",
        source: "DART 산출 → 결측 시 자체 계산",
        rationale:
          "DART 산출지표 `M221600`은 20종목 중 1건만 값이 있어 사실상 쓸 수 없다. 순수 이자비용 행 없이 금융비용만 공시하는 회사가 많아(삼성전자 포함) 폴백이 필요하고, **어느 계정을 분모로 썼는지는 계산식에 반드시 남긴다.**",
        alternatives: [
          {
            definition: "분모를 순수 이자비용으로 한정(없으면 N/A)",
            usedBy: "엄격한 정의",
            impact:
              "금융비용에는 환차손·파생손실이 섞여 있어 분모가 커진다 → **채택안의 배율이 실제보다 낮게 나온다.** 대신 표시 가능 종목이 크게 줄어든다.",
          },
        ],
        contested: true,
      },
    ],
  },
  {
    title: "⑥ 주주환원",
    metrics: [
      {
        label: "EPS (주당순이익)",
        adopted: "재무제표 기본주당이익(`ifrs-full_BasicEarningsLossPerShare`)과 배당공시(`alotMatter`) 값을 **둘 다 병기**",
        source: "DART 원본값",
        rationale:
          "두 원천이 산출 시점·기준이 달라 값이 어긋날 수 있다. 한쪽을 임의로 고르지 않고 나란히 보여 사용자가 판단하게 한다. 재무제표에 기본주당이익 행이 없는 회사(헬릭스미스)는 계속영업 기준으로 폴백한다.",
      },
      {
        label: "BPS (주당순자산)",
        adopted: "**지배주주지분 ÷ 발행주식총수**",
        source: "자체 계산",
        rationale:
          "DART가 BPS를 직접 제공하지 않는다. 분자는 비지배지분을 뺀 지배주주지분을 쓴다 — 이 회사 주주 몫이 아닌 금액을 주당으로 나누면 의미가 없기 때문이다.",
        alternatives: [
          {
            definition: "분모를 **유통주식수**(발행주식총수 − 자기주식)로",
            usedBy: "자기주식 소각을 전제한 이론적 청산가치",
            impact: "자기주식 비중이 큰 회사일수록 BPS가 높게 나온다. 자기주식수는 별도 항목으로 함께 표시 중이다.",
          },
          {
            definition: "분자를 자본총계(비지배 포함)로",
            usedBy: "단순 계산",
            impact: "지주사에서 BPS가 과대 계상된다.",
          },
        ],
        contested: true,
      },
      {
        label: "배당성향",
        adopted: "DART 산출지표(`M451000`)와 배당총액 ÷ 지배주주 귀속 순이익 계산값을 **둘 다 병기**. 부호가 다르거나 10%p 이상 벌어지면 '산출 기준 상이' 배지 자동 부착",
        source: "DART 산출 + 자체 계산",
        rationale:
          "두 값의 산출 기준이 달라 어긋나는 경우가 실제로 있다. 적자 기업은 분모가 음수라 음수 배당성향이 나오는데, 이때는 수치 대신 `N/A [분모 음수]`로 표기한다.",
        contested: true,
      },
      {
        label: "배당 0원 vs 데이터 없음",
        adopted: "무배당이 확인되면 `0원 [무배당 확인]`, 읽지 못한 경우 `데이터 없음`으로 **구분 표기**",
        source: "DART 원본값",
        rationale:
          "무배당 회사도 응답 status가 `000`(정상)으로 오고 배당 행 값만 `-`다. 즉 status로는 판정할 수 없다. 두 경우는 투자 판단이 완전히 달라 반드시 갈라야 한다.",
      },
    ],
  },
  {
    title: "⑦ 밸류에이션",
    metrics: [
      {
        label: "종가 · 시가총액 · PER · PBR",
        adopted: "**표시하지 않음** — `원천 미확보`로 비워 둠",
        source: "DART 원본값",
        rationale:
          "DART OpenAPI는 공시 서류만 제공하고 시세를 제공하지 않는다. 네 항목 모두 분자가 주가라 시세 API를 연동하기 전에는 원리적으로 계산할 수 없다. 근거 없는 숫자를 채우지 않는다.",
        alternatives: [
          {
            definition: "시세 API 연동(공공데이터포털 금융위원회_주식시세정보 등)",
            usedBy: "일반 투자 정보 서비스",
            impact: "연동 시 네 항목이 채워진다. 적자 기업의 PER는 음수가 되므로 N/A 처리 규칙이 함께 필요하다.",
          },
        ],
        contested: true,
      },
      {
        label: "배당수익률",
        adopted: "DART 배당공시(`alotMatter`)가 제공하는 회사 산출값을 그대로 사용",
        source: "DART 원본값",
        rationale:
          "원래 DPS ÷ 주가라 시세가 필요하지만, 배당공시가 회사가 계산해 둔 값을 실어 주기 때문에 이 항목만 시세 없이 채울 수 있다.",
      },
    ],
  },
];

/** 관점 차이로 분쟁 소지가 있는 지표 수 — 탭 배지에 쓴다. */
export function contestedCount(): number {
  return METRIC_BASIS.reduce((sum, s) => sum + s.metrics.filter((m) => m.contested).length, 0);
}
