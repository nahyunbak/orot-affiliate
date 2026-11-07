import type { Metadata } from "next";
import type { PropsWithChildren } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Inchain (인체인) — 브랜드와 인플루언서를 잇다",
  description:
    "브랜드와 인플루언서를 연결하는 Inchain. 인스타그램 캠페인 피드 검수부터 Maroo 테스트넷 보상 지급까지.",
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
