import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "AI営業リード獲得システム",
  description:
    "AIを活用した営業リード獲得・企業情報収集・メールアドレス取得を自動化するシステム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <div className="app-shell">
          <Sidebar />
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
