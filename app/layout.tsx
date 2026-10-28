import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Week Optimizer | Fantasy Basketball",
  description:
    "Turn your fantasy basketball acquisitions into more scheduled games.",
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
