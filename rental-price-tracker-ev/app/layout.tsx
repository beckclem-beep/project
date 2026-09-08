import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rental Price Tracker",
  description: "Hertz EV price calendar for the next 3 months."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
