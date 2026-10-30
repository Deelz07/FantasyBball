import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Week Optimizer | Fantasy Basketball",
  description:
    "Find one-for-one fantasy basketball swaps that add scheduled games.",
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
