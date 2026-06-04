import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Station V2",
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
