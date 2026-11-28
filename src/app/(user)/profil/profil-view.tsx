"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Camera,
  LogOut,
  User,
  Mail,
  Calendar,
  Wallet,
  BanknoteArrowDown,
  BanknoteArrowUp,
  Gift,
  ShieldCheck,
  ReceiptText,
  ArrowUpRight,
  Target,
  type LucideIcon,
} from "lucide-react";
import { PageShell, Reveal, EmptyState } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserProfile } from "@/context/user-profile-context";
import { supabase } from "@/lib/supabase";
import { cn, formatDateTime, formatIDR } from "@/lib/utils";
import { TarikSaldoModal } from "@/app/(user)/saldo/tarik-saldo-modal";
import {
  EWALLET_CONFIGS,
  type EWalletMethod,
} from "@/components/ui/ewallet-logos";
import {
  type TransactionRecord,
  type WithdrawalStatus,
} from "@/lib/mock-data";

/* ------------------------------------------------------------------ */
/* Saldo & Riwayat Constants & Types                                  */
/* ------------------------------------------------------------------ */

const withdrawalMeta: Record<
  WithdrawalStatus,
  { label: string; tone: "success" | "warning" | "info" | "danger" }
> = {
  berhasil: { label: "BERHASIL", tone: "success" },
  diproses: { label: "DIPROSES", tone: "info" },
  ditolak: { label: "DITOLAK", tone: "danger" },
};

const transactionIcons: Record<TransactionRecord["type"], LucideIcon> = {
  deposit: BanknoteArrowDown,
  withdrawal: BanknoteArrowUp,
  bonus: Gift,
  refund: BanknoteArrowDown,
  adjustment: BanknoteArrowDown,
};

const transactionTones: Record<TransactionRecord["type"], string> = {
  deposit: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  withdrawal: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  bonus: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  refund: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  adjustment: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
};

type UnifiedTransaction = {
  id: string;
  type: TransactionRecord["type"];
  amount: number;
  title: string;
  description: string;
  createdAt: string;
  status?: WithdrawalStatus;
  method?: string;
  accountNumber?: string;
};

function TransactionRow({ record, index }: { record: UnifiedTransaction; index: number }) {
  const isWithdrawal = record.type === "withdrawal";
  const isRefund =
    record.type === "refund" ||
    record.title.toLowerCase().includes("pengembalian dana");
  const methodKey = isWithdrawal ? ((record.method || "DANA").toUpperCase() as EWalletMethod) : null;
  const config = methodKey ? (EWALLET_CONFIGS[methodKey] || EWALLET_CONFIGS.DANA) : null;
  const isCredit =
    record.type === "deposit" ||
    record.type === "bonus" ||
    record.type === "adjustment" ||
    isRefund;

  const Icon = isWithdrawal
    ? BanknoteArrowUp
    : isRefund
      ? BanknoteArrowDown
      : transactionIcons[record.type] || ReceiptText;
  const toneClass = isWithdrawal
    ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
    : isRefund
      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
      : transactionTones[record.type] || "bg-white/5 text-zinc-300 border border-white/10";

  const displayDescription = isRefund ? "Refund penarikan" : record.description;

  return (
    <div
      className="animate-fade-up flex items-center gap-3 px-4 py-3.5 transition-colors duration-300 hover:bg-white/5 sm:gap-4 sm:px-5 md:px-6 md:py-4"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {config ? (
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl font-bold text-xs shadow-2xs border"
          style={{
            backgroundColor: `${config.brandColor}15`,
            color: config.brandColor,
            borderColor: `${config.brandColor}30`,
          }}
        >
          {config.name}
        </span>
      ) : (
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl shadow-2xs", toneClass)}>
          <Icon className="size-4" strokeWidth={2.2} aria-hidden="true" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.82rem] font-semibold text-white">{record.title}</p>
        <p className="mt-0.5 truncate text-[0.7rem] text-zinc-400">
          {displayDescription} · {formatDateTime(record.createdAt)}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        <span
          className={cn(
            "text-[0.85rem] font-bold tracking-tight tabular-nums",
            isCredit ? "text-emerald-400" : "text-rose-400"
          )}
        >
          {isCredit ? "+" : "-"}
          {formatIDR(record.amount)}
        </span>
        {record.status && (
          <StatusBadge
            tone={withdrawalMeta[record.status]?.tone || "info"}
            className="text-[0.62rem] py-0 px-2 font-bold"
          >
            {withdrawalMeta[record.status]?.label || record.status.toUpperCase()}
          </StatusBadge>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main ProfilView                                                    */
/* ------------------------------------------------------------------ */

export function ProfilView() {
  const {
    userProfile,
    avatarImage,
    isLoading,
    siteConfig,
    updateAvatar,
    wallet,
    withdrawals,
    transactions,
    isWalletLoading,
    isHistoryLoading,
    refreshWallet,
    refreshHistory,
  } = useUserProfile();

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = React.useState(false);

  // Gabungkan riwayat transaksi dan riwayat penarikan menjadi satu daftar terpadu
  const unifiedTransactions: UnifiedTransaction[] = React.useMemo(() => {
    const list: UnifiedTransaction[] = [];

    // Tambahkan transaksi biasa (deposit, bonus, refund, dll) — hindari duplikasi baris withdrawal yang sudah ada di tabel withdrawals
    for (const t of transactions) {
      if (t.type === "withdrawal" && withdrawals.length > 0) continue;
      list.push({
        id: t.id,
        type: t.type,
        amount: t.amount,
        title: t.title,
        description: t.description,
        createdAt: t.createdAt,
      });
    }

    // Tambahkan penarikan lengkap dengan nama pemilik DANA hasil Account Inquiry
    for (const w of withdrawals) {
      const config = EWALLET_CONFIGS[(w.method || "DANA").toUpperCase() as EWalletMethod] || EWALLET_CONFIGS.DANA;
      const ownerPart = w.accountName ? ` a/n ${w.accountName}` : "";
      list.push({
        id: `wd-${w.id}`,
        type: "withdrawal",
        amount: w.amount,
        title: `Penarikan ${config.name}`,
        description: `${w.accountNumber || "-"}${ownerPart}`,
        createdAt: w.createdAt,
        status: w.status,
        method: w.method,
        accountNumber: w.accountNumber,
      });
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [transactions, withdrawals]);

  const firstLetter = (userProfile.name || "P").trim().charAt(0).toUpperCase() || "P";

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedMimeTypes.includes(file.type)) {
      toast.error("Format gambar tidak didukung", {
        description: "Harap pilih foto berformat JPG, PNG, atau WebP.",
      });
      e.target.value = "";
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Ukuran foto terlalu besar", {
        description: "Ukuran maksimal foto profil adalah 2MB.",
      });
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      if (typeof dataUrl !== "string" || !/^data:image\/(jpeg|png|webp);base64,/i.test(dataUrl)) {
        toast.error("File gambar tidak valid");
        return;
      }
      await updateAvatar(dataUrl);
      toast.success("Foto profil berhasil diperbarui");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <PageShell>
      {/* Hidden file input for photo upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleImageUpload}
        className="hidden"
        aria-label="Upload foto profil"
      />

      <div className="space-y-6 pt-4 sm:pt-6">
        {/* Card 1: Main Profile & Saldo Akun Card */}
        <Reveal delay={40}>
          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#121217]/85 p-4.5 shadow-2xl backdrop-blur-xl sm:p-5.5">
            {/* Ambient subtle glow */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 size-72 rounded-full bg-sky-500/10 blur-3xl"
            />

            {/* Header: Profil & Saldo Akun + Keluar Akun */}
            <div className="relative flex items-center justify-between gap-3 pb-5 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="flex size-7.5 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-xs">
                  <User className="size-3.5 stroke-[2.2]" />
                </span>
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">Profil &amp; Saldo Akun</h3>
              </div>

              <button
                type="button"
                onClick={async () => {
                  try {
                    await fetch("/api/auth/logout", {
                      method: "POST",
                      headers: { "X-Requested-With": "XMLHttpRequest" },
                    }).catch(() => {});
                    if (supabase) {
                      await supabase.auth.signOut();
                    }
                  } catch {}
                  try {
                    localStorage.removeItem("setorgmail_auth");
                    localStorage.removeItem("setorgmail_cached_profile_v1");
                    localStorage.removeItem("setorgmail_cached_stats_v1");
                    localStorage.removeItem("setorgmail_cached_wallet_v1");
                    localStorage.removeItem("setorgmail_cached_ewallets_v1");
                    localStorage.removeItem("setorgmail_cached_deposits_v1");
                    localStorage.removeItem("setorgmail_cached_withdrawals_v1");
                    localStorage.removeItem("setorgmail_cached_transactions_v1");
                    localStorage.removeItem("setorgmail_cached_tickets_v1");
                    localStorage.removeItem("user_profile_avatar");
                  } catch {}
                  toast.success("Berhasil keluar akun", {
                    description: "Sesi kamu telah diakhiri.",
                  });
                  window.location.href = "/login";
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-400 shadow-2xs transition-all hover:bg-rose-500/20 active:scale-95 cursor-pointer whitespace-nowrap"
              >
                <LogOut className="size-3.5 text-rose-400" />
                <span>Keluar Akun</span>
              </button>
            </div>

            {/* Bagian 1: Identitas User */}
            <div className="relative py-5 border-b border-white/10">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
                {isLoading ? (
                  <div className="flex items-center gap-4">
                    <Skeleton className="size-16 rounded-full shrink-0" />
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-36 rounded-lg" />
                      <Skeleton className="h-3.5 w-48 rounded-md" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      title="Klik untuk ganti foto profil"
                      className="relative flex size-16 shrink-0 items-center justify-center rounded-full border-2 border-sky-400/30 bg-gradient-to-br from-sky-400 via-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/25 ring-3 ring-sky-500/20 cursor-pointer transition-transform hover:scale-105 active:scale-95"
                    >
                      {avatarImage ? (
                        <img
                          src={avatarImage}
                          alt={userProfile.name}
                          className="size-full rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-xl font-black tracking-tight text-white select-none">
                          {firstLetter}
                        </span>
                      )}
                      <div className="absolute bottom-0 right-0 flex size-5.5 items-center justify-center rounded-full border-2 border-[#121217] bg-gradient-to-r from-sky-400 to-blue-600 text-white shadow-xs">
                        <Camera className="size-2.5" />
                      </div>
                    </div>

                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-white truncate">
                          {userProfile.name}
                        </h2>
                        {(userProfile.role?.toLowerCase() === "admin" || userProfile.email === "komangabiw@gmail.com") && (
                          <>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                              <ShieldCheck className="size-3" />
                              Admin
                            </span>
                            <a
                              href="/admin"
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all active:scale-95"
                            >
                              Dashboard Admin &rarr;
                            </a>
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <Mail className="size-3.5 text-sky-400 shrink-0" />
                          <span className="truncate text-zinc-200 font-medium">{userProfile.email}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 shrink-0">
                          <Calendar className="size-3.5 text-sky-400 shrink-0" />
                          <span>Gabung {userProfile.joinedAt || "-"}</span>
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Bagian 2: Saldo Akun & Tombol Tarik Saldo (menggantikan area Pilihan E-Wallet) */}
            <div className="relative pt-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/40 px-4.5 py-4">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Wallet className="size-3.5 text-sky-400" aria-hidden="true" />
                    <p className="text-[0.68rem] font-bold tracking-wider text-zinc-400 uppercase">
                      Saldo Akun
                    </p>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                    {isWalletLoading ? (
                      <Skeleton className="h-7 w-28 rounded-lg" />
                    ) : (
                      <span className="text-2xl sm:text-[1.85rem] font-black tracking-tight text-white tabular-nums leading-none">
                        {formatIDR(wallet.balance)}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-[0.7rem] font-semibold text-sky-400">
                      <Target className="size-3 text-sky-400" aria-hidden="true" />
                      Min. {formatIDR(siteConfig?.min_withdrawal || wallet.minimumWithdrawal || 5000)}
                    </span>
                  </div>
                </div>

                <Button
                  size="md"
                  className="w-full sm:w-auto shadow-lg shadow-sky-500/25 bg-gradient-to-r from-sky-400 via-sky-500 to-blue-600 hover:from-sky-300 hover:to-blue-500 text-white font-bold rounded-xl px-6 py-2.5 cursor-pointer active:scale-95 shrink-0"
                  onClick={() => setIsWithdrawModalOpen(true)}
                  leftIcon={<ArrowUpRight className="size-4" aria-hidden="true" />}
                >
                  Tarik Saldo
                </Button>
              </div>
            </div>
          </section>
        </Reveal>

        {/* Section 2: Riwayat Transaksi (Termasuk Penarikan, Refund & Bonus) */}
        <Reveal delay={120}>
          <div className="mt-2">
            {isHistoryLoading ? (
              <HistorySkeletonList title="Riwayat Transaksi" />
            ) : (
              <TransactionList items={unifiedTransactions} />
            )}
          </div>
        </Reveal>
      </div>

      {/* Modal Penarikan Saldo */}
      <TarikSaldoModal
        open={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        balance={wallet.balance}
        minimum={wallet.minimumWithdrawal}
        initialMethod="DANA"
        onSuccess={() => {
          refreshWallet();
          refreshHistory();
        }}
      />
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

function HistorySkeletonList({ title }: { title: string }) {
  return (
    <Card className="overflow-hidden border border-white/10 bg-[#121217]/85 shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-5 md:px-6 md:py-4">
        <p className="text-[0.8rem] font-semibold text-white">{title}</p>
        <Skeleton className="h-4 w-14 rounded-full" />
      </div>
      <div className="divide-y divide-white/5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-5 md:px-6 md:py-4">
            <Skeleton className="size-10 rounded-xl shrink-0" />
            <div className="flex-1 space-y-1.5 min-w-0">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TransactionList({ items }: { items: UnifiedTransaction[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ReceiptText className="size-7 text-sky-400" strokeWidth={1.8} aria-hidden="true" />}
        title="Belum ada transaksi"
        description="Semua aktivitas saldo akan tercatat di sini."
      />
    );
  }

  return (
    <Card className="overflow-hidden border border-white/10 bg-[#121217]/85 shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-5 md:px-6 md:py-4">
        <p className="text-[0.8rem] font-semibold text-white">Riwayat Transaksi</p>
        <span className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[0.68rem] font-semibold text-zinc-300 tabular-nums">
          {items.length} data
        </span>
      </div>
      <div className="divide-y divide-white/5">
        {items.map((record, index) => (
          <TransactionRow key={record.id} record={record} index={index} />
        ))}
      </div>
    </Card>
  );
}
