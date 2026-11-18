import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Week Optimizer | Fantasy Basketball",
  description:
    "Rank fantasy basketball streams by games, scoring average, and opponent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
