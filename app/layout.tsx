import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SnapFlow — Smart Camera Workflow Builder",
  description: "Air-gapped, privacy-first smart camera orchestration",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-surface text-slate-200 antialiased">{children}</body>
    </html>
  );
}
