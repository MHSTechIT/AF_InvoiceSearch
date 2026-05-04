import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MHS Invoice Generator",
  description: "My Health School - Invoice Generation System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
