import { readFileSync } from "node:fs";
import { join } from "node:path";

import universeRaw from "@/data/universe.json";

import styles from "./page.module.css";

/**
 * 20종목 유니버스 표시 화면.
 *
 * data/universe.json은 scripts/resolve-corp-codes.ts가 corpCode.xml + company.json(20회)
 * 실측으로 만든 결과다. 서버 컴포넌트 — 정적 import로 데이터를 읽고, 각 행의 원본
 * company.json은 data/company/{stockCode}.json에서 읽어 collapse로 보여준다
 * (T5 SourcePanel 이전이라 <details><summary>만 사용).
 */

interface UniverseRow {
  stockCode: string;
  corpCode: string;
  name: string;
  market: string;
  indutyCode: string;
  ksic2: string;
  accMt: string;
  profile: string;
  profileSource: string;
  note: string;
}

const MARKET_LABEL: Record<string, string> = {
  Y: "코스피",
  K: "코스닥",
  N: "코넥스",
  E: "기타",
};

const PROFILE_LABEL: Record<string, string> = {
  NON_FIN: "비금융",
  FIN_BANK: "금융·은행",
  FIN_SECURITIES: "금융·증권",
  FIN_INSURANCE: "금융·보험",
  FIN_HOLDING: "금융·지주",
};

const PROFILE_SOURCE_LABEL: Record<string, string> = {
  KSIC_AUTO: "자동 (KSIC)",
  MANUAL: "수동 확정",
};

const rows: UniverseRow[] = universeRaw;

function loadCompanyRaw(stockCode: string): unknown {
  const path = join(process.cwd(), "data", "company", `${stockCode}.json`);
  return JSON.parse(readFileSync(path, "utf-8"));
}

export default function UniversePage() {
  const finCount = rows.filter((r) => r.profile !== "NON_FIN").length;
  const nonFinCount = rows.length - finCount;
  const nonDecCount = rows.filter((r) => r.accMt !== "12").length;

  return (
    <main className={styles.main}>
      <h1>20종목 유니버스 (/universe)</h1>
      <p className={styles.hint}>
        corpCode.xml(고유번호 전체 목록)과 company.json(기업개황, 20회 호출) 실측으로 확정한 유니버스다. 손익구조는
        KSIC 중분류(induty_code 앞 2자리)로 금융/비금융을 1차 자동판정하고, 금융업 세분류(은행·증권·보험·지주)만
        수동으로 확정했다 — 판정출처 컬럼에서 자동/수동 여부를 그대로 노출한다.
      </p>

      <dl className={styles.summary}>
        <div>
          <dt>총 종목</dt>
          <dd>{rows.length}</dd>
        </div>
        <div>
          <dt>금융 / 비금융</dt>
          <dd>
            {finCount} / {nonFinCount}
          </dd>
        </div>
        <div>
          <dt>결산월 ≠ 12</dt>
          <dd>{nonDecCount}건</dd>
        </div>
      </dl>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>종목코드</th>
              <th>이름</th>
              <th>시장</th>
              <th>KSIC</th>
              <th>KSIC앞2</th>
              <th>결산월</th>
              <th>손익구조</th>
              <th>판정출처</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.stockCode}>
                <td className={styles.mono}>{row.stockCode}</td>
                <td>{row.name}</td>
                <td>
                  {MARKET_LABEL[row.market] ?? row.market} ({row.market})
                </td>
                <td className={styles.mono}>{row.indutyCode}</td>
                <td className={styles.mono}>{row.ksic2}</td>
                <td className={row.accMt !== "12" ? styles.highlight : undefined}>{row.accMt}월</td>
                <td>{PROFILE_LABEL[row.profile] ?? row.profile}</td>
                <td>{PROFILE_SOURCE_LABEL[row.profileSource] ?? row.profileSource}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className={styles.details}>
        <h2>원본 company.json (종목별)</h2>
        {rows.map((row) => (
          <details key={row.stockCode} className={styles.detail}>
            <summary>
              {row.name} ({row.stockCode}) — {row.note}
            </summary>
            <pre className={styles.pre}>{JSON.stringify(loadCompanyRaw(row.stockCode), null, 2)}</pre>
          </details>
        ))}
      </section>
    </main>
  );
}
