import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hermes WebUI",
  description: "Mission control for Hermes Agent profiles",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-bg text-ink antialiased">{children}</body>
    </html>
  );
}
