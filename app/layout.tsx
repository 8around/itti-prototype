import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "이띠 DART 프로토타입",
  description: "DART 공시 원본 값을 그대로 추적할 수 있는 20종목 재무 프로토타입 — 정규화 엔진, 출처(SourcePanel) collapse, 프로필별 손익 화면을 실증한다.",
};

/**
 * 리뷰 픽스(I6) — 화면 5개(종목 리스트·유니버스·비교·킷친싱크·디버그)를 오가려면 지금까지는
 * 주소창에 직접 경로를 입력해야 했다. 서버 컴포넌트 그대로 유지한다("use client" 없이
 * next/link만 사용) — 전역 제약(§2)의 "차트·지표 컴포넌트는 서버 컴포넌트" 원칙과 별개로,
 * 레이아웃 자체도 처음부터 클라이언트 컴포넌트였던 적이 없다.
 */
const NAV_LINKS = [
  { href: "/", label: "종목" },
  { href: "/universe", label: "유니버스" },
  { href: "/compare/pnl", label: "비교(삼성vsKB)" },
  { href: "/kitchen-sink", label: "킷친싱크" },
  { href: "/debug", label: "디버그" },
] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>
        <header className="siteHeader">
          <nav className="siteNav">
            <Link href="/" className="siteBrand">
              이띠 DART 프로토타입
            </Link>
            <ul className="siteNavList">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
