import type { Metadata, Viewport } from "next";
import { Manrope, Playfair_Display } from "next/font/google";
import { ConsentManager } from "@/components/privacy/consent-manager";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Online Schulung Wimpernverlängerung | 1:1-Technik & Zertifikat",
    template: "%s | Schulung Wimpernverlängerung",
  },
  description:
    "Lerne professionelle 1:1-Wimpernverlängerung flexibel online. Sieben Lektionen, Wissenstests, sofortiger Zugang und persönliches Abschlusszertifikat.",
  applicationName: "Schulung Wimpernverlängerung",
  category: "education",
  icons: {
    icon: [
      {
        url: "/brand/logo-mark-selected.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        url: "/brand/favicon-selected-32.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
    shortcut: "/brand/favicon-selected-32.png",
    apple: {
      url: "/brand/apple-touch-icon-selected.png",
      sizes: "180x180",
      type: "image/png",
    },
  },
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: "Schulung Wimpernverlängerung",
    title: "Online Schulung Wimpernverlängerung",
    description:
      "Professionelle 1:1-Technik in sieben strukturierten Lektionen lernen.",
    url: "/",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FBF9F6",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="de"
      data-scroll-behavior="smooth"
      className={`${manrope.variable} ${playfair.variable}`}
    >
      <body className="min-h-dvh overflow-x-hidden antialiased">
        <ConsentManager
          version={
            process.env.NEXT_PUBLIC_COOKIE_CONSENT_VERSION ??
            "cookies-2026-07-21"
          }
        >
          {children}
        </ConsentManager>
      </body>
    </html>
  );
}
