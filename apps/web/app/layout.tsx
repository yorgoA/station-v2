import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

// Tab title is env-aware so a staging tab is never confused with a prod tab.
// Prefix (not suffix) so it stays visible when the browser truncates the tab.
const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV ?? "local"; // production | preview | local
const TITLE =
  APP_ENV === "preview" ? "[staging] Station V2" : APP_ENV === "local" ? "[local] Station V2" : "Station V2";

export const metadata: Metadata = {
  title: TITLE,
  description: "Electricity management V2 prototype"
};

// Applies a saved light/dark override before first paint, so switching the
// theme (app/_components/theme-toggle.tsx) doesn't flash the wrong palette
// on reload. Falls back to the OS setting (handled purely in CSS) otherwise.
const NO_FLASH_THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('station_v2_theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
