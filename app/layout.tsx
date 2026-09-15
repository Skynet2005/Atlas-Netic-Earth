import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas-Netic — Explore Earth in 3D",
  applicationName: "Atlas-Netic",
  description: "Explore Earth with measured 3D terrain, satellite imagery, country borders, and public aircraft and AIS transponder reports.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
