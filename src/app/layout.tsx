import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://metrixgm.com"),
  title: "Metrix | AI Genel Müdür",
  description: "Şirketinizi yöneten yapay zekâ genel müdür.",
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16", type: "image/x-icon" },
      { url: "/brand/metrix-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/metrix-icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/brand/metrix-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#1C1914",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
