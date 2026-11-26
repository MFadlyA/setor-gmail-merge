import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://www.setorgmail.com";
const SITE_TITLE = "Setor Gmail by Winter - Cepat & Terpercaya";
const SITE_DESCRIPTION =
  "Setor Gmail by Winter. Setor Gmail dengan harga transparan, penarikan cepat via DANA, GoPay, OVO, ShopeePay.";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Setor Gmail by Winter",
      alternateName: ["Setor Gmail", "SetorGmail"],
      description: SITE_DESCRIPTION,
      inLanguage: "id-ID",
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Setor Gmail by Winter",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo_removebg.png`,
      },
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: SITE_URL,
  },
  title: {
    default: SITE_TITLE,
    template: "%s | Setor Gmail by Winter",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Setor Gmail",
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: SITE_URL,
    siteName: "Setor Gmail by Winter",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/logo_removebg.png",
        width: 512,
        height: 512,
        alt: "Setor Gmail by Winter",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/logo_removebg.png"],
  },
  icons: {
    icon: [
      { url: "/logo_removebg.png", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    shortcut: "/logo_removebg.png",
    apple: "/logo_removebg.png",
  },
  appleWebApp: {
    capable: true,
    title: "Setor Gmail",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
