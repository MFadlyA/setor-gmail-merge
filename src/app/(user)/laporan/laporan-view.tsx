"use client";

import Image from "next/image";
import { Sparkles } from "lucide-react";
import { PageShell, Reveal } from "@/components/layout/page-shell";
import { useUserProfile } from "@/context/user-profile-context";
import { sanitizeExternalUrl } from "@/lib/security";

const WHATSAPP_QR_URL =
  "https://chat.whatsapp.com/Kbey1hvCUO7JzH2FBEZsAy?s=cl&p=i&iam=2";

export function LaporanView() {
  const { siteConfig } = useUserProfile();
  const cleanUsername =
    (siteConfig?.telegram_admin_username || "winterhere").replace(/[^a-zA-Z0-9_]/g, "") ||
    "winterhere";
  const telegramUrl = sanitizeExternalUrl(
    `https://t.me/${cleanUsername}`,
    "https://t.me/winterhere",
    ["t.me", "telegram.me"]
  );

  return (
    <PageShell>
      <div className="flex flex-col items-center justify-center min-h-[76vh] py-6 px-4">
        <Reveal delay={40} className="flex flex-col items-center w-full max-w-[680px]">
          {/* Header Badge */}
          <div className="mb-6 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/10 px-3.5 py-1 text-[0.7rem] font-extrabold uppercase tracking-wider text-sky-300">
              <Sparkles className="size-3 text-sky-400" />
              Layanan Bantuan Resmi
            </span>
          </div>

          {/* 2 Kartu QR Resmi: Telegram & WhatsApp */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-[320px] sm:max-w-none">
            {/* Kolom 1: Telegram QR */}
            <div className="flex flex-col items-center">
              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Buka Telegram @${cleanUsername}`}
                className="relative w-full aspect-[876/1024] overflow-hidden rounded-[1.65rem] select-none drop-shadow-[0_20px_45px_rgba(41,169,234,0.22)] mb-4 transition-transform duration-300 hover:scale-[1.02]"
              >
                <Image
                  src="/qr-telegram.jpg"
                  alt={`Telegram QR @${cleanUsername}`}
                  fill
                  priority
                  unoptimized
                  className="object-cover"
                />
              </a>

              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full group relative inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-r from-[#0284c7] via-[#0ea5e9] to-[#38bdf8] px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-sky-500/25 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_28px_rgba(14,165,233,0.5)] active:scale-[0.98]"
              >
                <span
                  className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
                  aria-hidden="true"
                />
                <svg
                  className="size-5 shrink-0 fill-white transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:scale-110"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.94z" />
                </svg>
                <span className="relative z-10 tracking-wide font-extrabold text-[0.9rem]">
                  Chat via Telegram (@{cleanUsername})
                </span>
              </a>
            </div>

            {/* Kolom 2: WhatsApp QR */}
            <div className="flex flex-col items-center">
              <a
                href={WHATSAPP_QR_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Buka WhatsApp Resmi"
                className="relative w-full aspect-[877/1024] overflow-hidden rounded-[1.65rem] select-none drop-shadow-[0_20px_45px_rgba(34,197,94,0.22)] mb-4 transition-transform duration-300 hover:scale-[1.02]"
              >
                <Image
                  src="/qr-whatsapp.png"
                  alt="WhatsApp QR Resmi"
                  fill
                  priority
                  unoptimized
                  className="object-cover"
                />
              </a>

              <a
                href={WHATSAPP_QR_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full group relative inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-r from-[#16a34a] via-[#22c55e] to-[#4ade80] px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_28px_rgba(34,197,94,0.5)] active:scale-[0.98]"
              >
                <span
                  className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
                  aria-hidden="true"
                />
                <svg
                  className="size-5 shrink-0 fill-white transition-transform duration-300 group-hover:scale-110"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.121.553 4.192 1.604 6.018L.098 23.549l5.635-1.478a11.98 11.98 0 0 0 6.298 1.779h.005c6.645 0 12.03-5.386 12.03-12.031A11.982 11.982 0 0 0 20.54 3.52 11.982 11.982 0 0 0 12.031 0zm6.565 17.129c-.277.781-1.613 1.492-2.244 1.588-.578.087-1.31.124-2.115-.132-.488-.155-1.114-.362-1.916-.709-3.372-1.456-5.574-4.851-5.743-5.076-.168-.225-1.371-1.824-1.371-3.479 0-1.656.867-2.47 1.175-2.807.308-.337.672-.421.896-.421.224 0 .448.002.644.012.206.01.483-.078.756.577.277.669.946 2.302 1.029 2.47.084.169.14.366.028.59-.112.225-.168.365-.336.562-.168.197-.354.44-.505.59-.168.168-.343.351-.147.688.196.337.871 1.437 1.87 2.327 1.285 1.145 2.368 1.5 2.705 1.669.336.168.532.14.728-.085.196-.224.84-1.01 1.064-1.347.224-.337.448-.281.756-.168.308.112 1.961.925 2.297 1.094.336.168.56.253.644.393.084.141.084.815-.193 1.595z" />
                </svg>
                <span className="relative z-10 tracking-wide font-extrabold text-[0.9rem]">
                  Hubungi via WhatsApp
                </span>
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </PageShell>
  );
}
