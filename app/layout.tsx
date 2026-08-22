import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title:"Rental Price Tracker", description:"Live rental price search and tracking." };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="fr"><body>{children}</body></html>}