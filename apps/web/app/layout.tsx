import type { Metadata } from "next";
import "./globals.css";

// Tab title is env-aware so a staging tab is never confused with a prod tab.
// Prefix (not suffix) so it stays visible when the browser truncates the tab.
const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV ?? "local"; // production | preview | local
const TITLE =
  APP_ENV === "preview"
    ? "[staging] Station V2"
    : APP_ENV === "local"
      ? "[local] Station V2"
      : "Station V2";

export const metadata: Metadata = {
  title: TITLE,
  description: "Electricity management V2 prototype"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
