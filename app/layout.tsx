import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#02070c",
};

export const metadata: Metadata = {
  title: "Atlas-Netic — Earth Intelligence",
  applicationName: "Atlas-Netic",
  description: "Explore a live 3D Earth intelligence view with measured terrain, satellite imagery, public traffic, weather, fire, earthquake, and orbital data.",
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
