import type { Metadata } from "next";
import "./globals.css";
import "./sector-dashboard.css";

export const metadata: Metadata = {
  title: "每日资讯博弈 · A股宏观与行业投资看板",
  description: "聚焦宏观、利率、行业强度、风险与1—3个月波段行业机会的晨间看板。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
