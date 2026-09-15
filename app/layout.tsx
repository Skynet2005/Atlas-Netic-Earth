import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas Earth — Explore in 3D",
  description: "Explore a navigable 3D Earth with satellite imagery, elevation terrain, country borders, and overhead and tilted views.",
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
