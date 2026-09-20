import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_URL = "https://atlas-netic-earth.vercel.app";
const title = "Atlas-Netic — Live 3D Earth Intelligence";
const description = "Explore a live 3D Earth intelligence globe with satellite imagery, measured terrain, public aircraft and maritime traffic, satellites, earthquakes, active fires, and weather alerts.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#02070c",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: title,
    template: "%s | Atlas-Netic",
  },
  applicationName: "Atlas-Netic",
  description,
  keywords: [
    "3D Earth",
    "live Earth map",
    "earth intelligence",
    "aircraft tracking",
    "military aviation",
    "ship tracking",
    "satellite tracking",
    "earthquakes",
    "wildfires",
    "weather alerts",
    "Cesium globe",
  ],
  category: "technology",
  creator: "Atlas-Netic",
  publisher: "Atlas-Netic",
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Atlas-Netic",
    title,
    description,
    images: [{
      url: "/atlas-netic-social-preview-v2.jpg",
      width: 1200,
      height: 630,
      alt: "Atlas-Netic live 3D Earth intelligence globe with aircraft, ships, satellites, weather and routes",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/atlas-netic-social-preview-v2.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
