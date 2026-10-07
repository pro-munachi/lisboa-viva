import type { Metadata } from "next";
import "./globals.css";
import "./brand.css";
export const metadata: Metadata = {
  title: "ROAM — Every city. Your story.",
  description:
    "Start your ROAM story in Lisbon, our first playable city. Explore real streets, meet simulated locals, and shape a trip at your own pace.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
