import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ROAM — Lisboa ao teu ritmo",
  description:
    "Try Lisbon before you go. A miniature city, a few days, and a trip that feels like you.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  );
}
