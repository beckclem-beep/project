import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Rental Price Tracker",
  description: "Live Hertz rental price search and tracking.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="fr"><body>{children}</body></html>;
}
