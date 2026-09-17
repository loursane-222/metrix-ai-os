import type {
  Metadata
} from "next";

import type {
  ReactNode
} from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "METRIX",
  description: "METRIX Executive"
};

export default function RootLayout({
  children
}: {
  children: ReactNode;
}) {
  return (
    <html lang="tr">
      <body>
        {children}
      </body>
    </html>
  );
}
