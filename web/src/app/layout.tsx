import type { Metadata } from "next";
import type { PropsWithChildren } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "오롯 — 크리에이터의 콘텐츠가 보상으로",
  description: "인스타그램 캠페인 피드 검수와 Maroo 테스트넷 보상 지급",
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <body>
        <script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
