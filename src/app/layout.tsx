import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Metrix | AI Genel Müdür",
  description: "Şirketinizi yöneten yapay zekâ genel müdür.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
