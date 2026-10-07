import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./brand.css";
const appFont = localFont({
  src: "./fonts/DMSans-Variable.ttf",
  variable: "--font-roam-app",
  weight: "100 1000",
  display: "swap",
});
const gameFont = localFont({
  src: "./fonts/Outfit-Variable.ttf",
  variable: "--font-roam-game",
  weight: "100 900",
  display: "swap",
});
export const metadata: Metadata = {
  title: "ROAM — Every city. Your story.",
  description:
    "Start your ROAM story in Lisbon, our first playable city. Explore real streets, meet simulated locals, and shape a trip at your own pace.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${appFont.variable} ${gameFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
