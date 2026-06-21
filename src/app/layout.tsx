import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fund402 — Credit for the Machine Economy",
  description: "Just-in-time credit for AI agents paying x402 micropayments on Casper.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
