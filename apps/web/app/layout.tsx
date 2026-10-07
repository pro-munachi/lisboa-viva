import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ROAM — Lisbon. Your way.",
  description:
    "Try Lisbon before you go. A miniature city, a few days, and a trip that feels like you.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
