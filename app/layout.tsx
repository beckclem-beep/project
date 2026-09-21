import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rental Price Tracker",
  description: "Basic Hertz EV rental search"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fr"><body>{children}</body></html>;
}
