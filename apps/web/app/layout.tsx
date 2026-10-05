import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Lisboa Viva — a cidade é tua",
  description:
    "Constrói uma vida em Lisboa. Encontra o teu bairro, as tuas pessoas e o teu próximo capítulo.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  );
}
