import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "VetPro — 獸醫百科",
    template: "%s | VetPro",
  },
  description:
    "結構化獸醫疾病知識庫，彙整 PubMed、ACVIM、WSAVA、IRIS 等開源資源，自動追蹤最新文獻。",
  keywords: ["獸醫", "百科", "veterinary", "disease", "ACVIM", "PubMed"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {/* Top navigation */}
        <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
          <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg">
              <span className="text-2xl">🩺</span>
              <span className="text-primary">VetPro</span>
              <span className="hidden text-sm font-normal text-muted sm:inline">
                獸醫百科
              </span>
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link
                href="/browse"
                className="text-muted transition-colors hover:text-foreground"
              >
                瀏覽疾病
              </Link>
              <a
                href="https://github.com/sensa-ai-tech/vetpro"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted transition-colors hover:text-foreground"
              >
                GitHub
              </a>
            </div>
          </nav>
        </header>

        {/* Main content */}
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>

        {/* Footer */}
        <footer className="border-t border-border py-8 text-center text-sm text-muted">
          <div className="mx-auto max-w-6xl px-4">
            <p>
              VetPro — 開源獸醫百科全書 |{" "}
              <span className="text-xs">
                資料來源：PubMed、ACVIM、WSAVA、IRIS 等公開資源
              </span>
            </p>
            <p className="mt-1 text-xs">
              本站僅供專業獸醫參考，不構成醫療建議。臨床決策請結合實際病例判斷。
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
