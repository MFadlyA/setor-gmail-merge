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

export const metadata: Metadata = {
  title: {
    default: "Setor Gmail by Winter - Aman, Cepat & Trusted",
    template: "%s | Setor Gmail by Winter",
  },
  description:
    "Setor Gmail by Winter. Setor Gmail dengan harga transparan, penarikan cepat via DANA, GoPay, OVO, ShopeePay.",
  applicationName: "Setor Gmail",
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
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
