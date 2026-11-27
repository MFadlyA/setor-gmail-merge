"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Banknote,
  BanknoteArrowUp,
  LoaderCircle,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Clock,
} from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatIDR, formatRupiah } from "@/lib/utils";
import {
  EWALLET_CONFIGS,
  IndonesiaFlag,
  type EWalletMethod,
} from "@/components/ui/ewallet-logos";
import {
  getStoredEWalletData,
  saveStoredEWalletData,
} from "@/lib/generated-storage";
import {
  getCurrentAuthUser,
  inquireUserDanaAccount,
  insertWithdrawalRequest,
  type DanaInquiryClientResult,
} from "@/lib/supabase";
import { useUserProfile } from "@/context/user-profile-context";

const PHONE_MAX_LENGTH = 13;
const AUTO_DISBURSE_LIMIT = 10_000;

interface TarikSaldoModalProps {
  open: boolean;
  onClose: () => void;
  balance?: number;
  minimum?: number;
  initialMethod?: EWalletMethod;
  onSuccess?: () => void;
}

export function TarikSaldoModal({
  open,
  onClose,
  balance = 0,
  minimum = 5000,
  onSuccess,
}: TarikSaldoModalProps) {
  const { siteConfig, refreshSiteConfig } = useUserProfile();
  const isWithdrawalServiceActive =
    siteConfig?.is_withdrawal_active !== false && siteConfig?.is_dana_active !== false;
  const effectiveMinimum = siteConfig?.min_withdrawal || minimum || 5000;

  // DANA-only active method
  const selectedMethod: EWalletMethod = "DANA";
  const [danaNumber, setDanaNumber] = React.useState<string>("");
  const [amountInput, setAmountInput] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isInquiring, setIsInquiring] = React.useState(false);
  const [verifiedInquiry, setVerifiedInquiry] = React.useState<DanaInquiryClientResult | null>(null);
  const prevOpenRef = React.useRef(false);

  React.useEffect(() => {
    if (open && !prevOpenRef.current) {
      refreshSiteConfig();
      setVerifiedInquiry(null);
      if (balance > 0) {
        setAmountInput(formatRupiah(balance));
      } else {
        setAmountInput("");
      }

      const stored = getStoredEWalletData();
      if (stored?.accounts?.DANA) {
        const str = stored.accounts.DANA.trim();
        if (str && str !== "081234567890" && str !== "08123456789") {
          setDanaNumber(str);
        }
      }
    }
    prevOpenRef.current = open;
  }, [open, balance, refreshSiteConfig]);

  const withdrawAmount = React.useMemo(() => {
    const digitsOnly = amountInput.replace(/[^0-9]/g, "");
    return digitsOnly ? parseInt(digitsOnly, 10) : 0;
  }, [amountInput]);

  const config = EWALLET_CONFIGS.DANA;
  const currentNumber = danaNumber;
  const phoneValid = /^08\d{8,11}$/.test(currentNumber.trim());

  const taxFee = React.useMemo(() => {
    return siteConfig?.tax_dana_active === false ? 0 : (siteConfig?.tax_dana ?? 0);
  }, [siteConfig]);

  const netAmount = Math.max(withdrawAmount - taxFee, 0);
  const reached = balance >= effectiveMinimum && balance > 0;
  const remaining = Math.max(effectiveMinimum - balance, 0);

  const hasStartedAmount = amountInput.length > 0;
  const isBelowMinimum = hasStartedAmount && withdrawAmount < effectiveMinimum;
  const isExceedingBalance = hasStartedAmount && withdrawAmount > balance;
  const isExceedingMax = hasStartedAmount && withdrawAmount > 5000000;
  const isAmountValid =
    hasStartedAmount &&
    withdrawAmount >= effectiveMinimum &&
    withdrawAmount <= balance &&
    withdrawAmount <= 5000000;

  const canProceed =
    isWithdrawalServiceActive &&
    isAmountValid &&
    phoneValid &&
    reached &&
    !isLoading &&
    !isInquiring;

  const hasStartedTyping = currentNumber.length > 0;
  const isPrefixInvalid = hasStartedTyping && !currentNumber.startsWith("08");
  const isTooShort = hasStartedTyping && currentNumber.startsWith("08") && currentNumber.length < 10;
  const isAutoInstant = withdrawAmount > 0 && withdrawAmount <= AUTO_DISBURSE_LIMIT;

  const presets = React.useMemo(() => {
    if (balance <= 25000) return [5000, 10000];
    if (balance <= 50000) return [10000, 20000];
    if (balance <= 250000) return [20000, 50000];
    if (balance <= 500000) return [50000, 100000];
    return [100000, 250000];
  }, [balance]);

  const handleAmountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setVerifiedInquiry(null);
    const digitsOnly = event.target.value.replace(/[^0-9]/g, "");
    if (!digitsOnly) {
      setAmountInput("");
      return;
    }
    const capped = digitsOnly.slice(0, 10);
    const num = parseInt(capped, 10);
    if (isNaN(num)) {
      setAmountInput("");
      return;
    }
    setAmountInput(formatRupiah(num));
  };

  const handleSetMaxAmount = () => {
    if (balance > 0) {
      setVerifiedInquiry(null);
      setAmountInput(formatRupiah(balance));
    }
  };

  const handleNumberChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setVerifiedInquiry(null);
    const digitsOnly = event.target.value.replace(/[^0-9]/g, "");
    setDanaNumber(digitsOnly.slice(0, PHONE_MAX_LENGTH));
  };

  const validateInputsBeforeCall = (): boolean => {
    if (!currentNumber.startsWith("08") || !phoneValid) {
      toast.error("Nomor DANA tidak valid", {
        description: "Gunakan format 08xxxxxxxxxx (10–13 digit).",
      });
      return false;
    }
    if (!reached || !hasStartedAmount || withdrawAmount < effectiveMinimum) {
      toast.error("Nominal penarikan belum memenuhi syarat", {
        description: `Minimal penarikan adalah ${formatIDR(effectiveMinimum)}.`,
      });
      return false;
    }
    if (withdrawAmount > balance) {
      toast.error("Saldo tidak mencukupi", {
        description: `Nominal penarikan (${formatIDR(withdrawAmount)}) melebihi saldo tersedia (${formatIDR(balance)}).`,
      });
      return false;
    }
    if (withdrawAmount > 5000000) {
      toast.error("Melebihi batas maksimal", {
        description: "Batas maksimal penarikan instan adalah Rp5.000.000 per transaksi.",
      });
      return false;
    }
    return true;
  };

  // Step 1: Cek Akun DANA (Account Inquiry -> tampilkan customerName ke user)
  const handleCheckDanaAccount = async () => {
    if (!validateInputsBeforeCall()) return;

    setIsInquiring(true);
    try {
      const res = await inquireUserDanaAccount({
        accountNumber: currentNumber,
        amount: withdrawAmount,
      });

      if (!res.success) {
        toast.error("Verifikasi Akun DANA Gagal", {
          description: res.error || "Nomor DANA tidak valid atau tidak terdaftar.",
        });
        return;
      }

      setVerifiedInquiry(res);
      toast.success("Akun DANA Ditemukan!", {
        description: `Penerima: ${res.customerName || "-"} (${currentNumber})`,
      });
    } finally {
      setIsInquiring(false);
    }
  };

  // Step 2: Konfirmasi & Cairkan ke DANA
  const handleWithdraw = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateInputsBeforeCall()) return;

    // Jika belum verifikasi nama pemilik DANA, jalankan Cek Akun DANA terlebih dahulu
    if (!verifiedInquiry) {
      void handleCheckDanaAccount();
      return;
    }

    setIsLoading(true);

    const existingStored = getStoredEWalletData();
    saveStoredEWalletData({
      defaultMethod: "DANA",
      accounts: {
        ...(existingStored?.accounts || { DANA: "", OVO: "", GOPAY: "", SHOPEEPAY: "" }),
        DANA: currentNumber,
      },
    });

    (async () => {
      try {
        const user = await getCurrentAuthUser();
        if (!user) {
          toast.error("Sesi berakhir", {
            description: "Silakan login kembali untuk melanjutkan penarikan.",
          });
          return;
        }

        const res = await insertWithdrawalRequest(user.id, {
          amount: withdrawAmount,
          taxFee,
          netAmount,
          method: selectedMethod,
          accountNumber: currentNumber,
        });

        if (!res.success) {
          toast.error("Penarikan gagal", {
            description: res.error || "Gagal memproses penarikan saldo.",
          });
          return;
        }

        onSuccess?.();
        onClose();

        const ownerLabel = res.customerName || verifiedInquiry.customerName || currentNumber;
        if (res.autoDisbursed) {
          toast.success("Saldo Berhasil Cair ke DANA!", {
            description: `${formatIDR(netAmount)} telah dikirim otomatis ke DANA ${currentNumber} a/n ${ownerLabel}.`,
          });
        } else if (res.requiresAdminApproval) {
          toast.success("Menunggu Persetujuan Admin", {
            description: `Penarikan ${formatIDR(withdrawAmount)} (> Rp10.000) ke DANA a/n ${ownerLabel} sedang menunggu persetujuan Admin.`,
          });
        } else {
          toast.success("Permintaan Penarikan Diproses", {
            description: `Penarikan ${formatIDR(withdrawAmount)} ke DANA ${currentNumber} a/n ${ownerLabel} sedang diproses.`,
          });
        }
      } catch (err) {
        console.warn("DANA withdrawal error:", err);
        toast.error("Penarikan gagal", {
          description: "Terjadi gangguan sistem. Silakan coba beberapa saat lagi.",
        });
      } finally {
        setIsLoading(false);
      }
    })();
  };

  return (
    <Modal open={open} onClose={onClose} labelledBy="tarik-saldo-title">
      {/* Header */}
      <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-700 px-5 py-5 md:px-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 -right-10 size-32 rounded-full bg-white/15 blur-2xl"
        />
        <div className="relative flex items-start gap-3.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white shadow-sm">
            <Banknote className="size-5" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-0.5 text-[0.62rem] font-bold tracking-wider text-white uppercase">
              Pencairan Saldo DANA
            </span>
            <h2
              id="tarik-saldo-title"
              className="mt-1 text-lg font-bold tracking-tight text-white"
            >
              Penarikan ke Saldo DANA
            </h2>
            <p className="mt-0.5 text-[0.76rem] leading-relaxed text-white/85">
              Otomatis langsung cair untuk penarikan hingga Rp10.000.
            </p>
          </div>
          <ModalCloseButton onClick={onClose} label="Tutup Tarik Saldo" />
        </div>
      </div>

      {/* Body */}
      <form
        onSubmit={handleWithdraw}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 md:px-6"
      >
        {!isWithdrawalServiceActive && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-rose-500/35 bg-rose-950/40 p-3.5 text-xs text-rose-200">
            <AlertCircle className="size-4 shrink-0 text-rose-400 mt-0.5" />
            <div>
              <p className="font-bold text-rose-300">Layanan Penarikan Ditutup Sementara</p>
              <p className="mt-0.5 text-rose-200/85 leading-relaxed">
                Penarikan saldo ke DANA sedang dinonaktifkan sementara oleh Admin. Silakan coba kembali beberapa saat lagi.
              </p>
            </div>
          </div>
        )}

        {/* Info Saldo & Input Penarikan */}
        <div className="rounded-2xl border border-sky-500/30 bg-sky-950/30 p-4 space-y-2.5 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.68rem] font-bold tracking-wider text-sky-400 uppercase">
                Saldo Tersedia
              </p>
              <p className="text-sm font-bold text-sky-300 tabular-nums">
                {formatIDR(balance)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[0.68rem] font-bold tracking-wider text-sky-400 uppercase">
                Minimal Penarikan
              </p>
              <p className="text-sm font-bold text-sky-300 tabular-nums">
                {formatIDR(effectiveMinimum)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="tarik-saldo-input"
              className="flex h-12 items-center justify-center px-3.5 rounded-2xl border border-sky-500/30 bg-sky-500/10 font-bold text-base text-sky-300 shadow-2xs select-none shrink-0 cursor-pointer"
            >
              Rp
            </label>
            <div className="relative flex-1">
              <Input
                id="tarik-saldo-input"
                type="text"
                inputMode="numeric"
                placeholder={`Minimal ${formatRupiah(effectiveMinimum)}`}
                value={amountInput}
                onChange={handleAmountChange}
                className={cn(
                  "font-black text-xl h-12 bg-black/40 text-white tabular-nums border-white/10 shadow-2xs focus:bg-black/50 focus:border-sky-500/60 px-4",
                  hasStartedAmount && !isAmountValid && "border-rose-500 focus-visible:ring-rose-500/30"
                )}
              />
            </div>
          </div>

          {/* Quick preset chips */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[0.68rem] text-zinc-400 font-medium mr-0.5">Pilihan Cepat:</span>
            {presets.map((val) => {
              const isSelected = withdrawAmount === val;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    setVerifiedInquiry(null);
                    setAmountInput(formatRupiah(val));
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer active:scale-95",
                    isSelected
                      ? "bg-gradient-to-r from-sky-400 to-blue-600 text-white border-sky-400 shadow-sm shadow-sky-500/20"
                      : "bg-white/5 text-zinc-300 border-white/10 hover:border-white/20 hover:bg-white/10"
                  )}
                >
                  {formatIDR(val)}
                </button>
              );
            })}
            <button
              type="button"
              onClick={handleSetMaxAmount}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer active:scale-95",
                withdrawAmount === balance && balance > 0
                  ? "bg-gradient-to-r from-sky-400 to-blue-600 text-white border-sky-400 shadow-sm shadow-sky-500/20"
                  : "bg-white/5 text-zinc-300 border-white/10 hover:border-white/20 hover:bg-white/10"
              )}
            >
              Semua ({formatIDR(balance)})
            </button>
          </div>

          {hasStartedAmount && isExceedingBalance && (
            <p className="text-[0.72rem] text-rose-400 font-semibold flex items-center gap-1.5">
              <AlertCircle className="size-3.5 shrink-0" />
              Nominal melebihi saldo tersedia (maksimal {formatIDR(balance)})
            </p>
          )}
          {hasStartedAmount && isBelowMinimum && (
            <p className="text-[0.72rem] text-amber-400 font-semibold flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 shrink-0" />
              Nominal minimal penarikan adalah {formatIDR(effectiveMinimum)}
            </p>
          )}
          {hasStartedAmount && isExceedingMax && (
            <p className="text-[0.72rem] text-rose-400 font-semibold flex items-center gap-1.5">
              <AlertCircle className="size-3.5 shrink-0" />
              Maksimal penarikan adalah Rp5.000.000
            </p>
          )}
          {!hasStartedAmount && (
            <p className="text-[0.7rem] text-zinc-400">
              {reached
                ? "Saldo sudah mencukupi untuk melakukan penarikan."
                : `Kurang ${formatIDR(remaining)} lagi untuk mencapai batas minimal penarikan.`}
            </p>
          )}
        </div>

        {/* Metode Pencairan Tunggal: DANA */}
        <div className="flex items-center justify-between rounded-xl border border-sky-500/35 bg-sky-500/10 px-3.5 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sky-300">Metode Pencairan: DANA</span>
            <CheckCircle2 className="size-3.5 text-sky-400" />
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border",
              isAutoInstant || withdrawAmount === 0
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                : "bg-amber-500/15 text-amber-300 border-amber-500/30"
            )}
          >
            {isAutoInstant || withdrawAmount === 0 ? (
              <>
                <Zap className="size-3" />
                <span>Instan Otomatis</span>
              </>
            ) : (
              <>
                <Clock className="size-3" />
                <span>&gt; Rp10rb ACC Admin</span>
              </>
            )}
          </span>
        </div>

        {/* Input Nomor DANA */}
        <div>
          <label
            htmlFor="tarik-ewallet-number"
            className="block text-[0.78rem] font-bold text-zinc-200 mb-1.5"
          >
            Nomor {config.name} Penerima
          </label>
          <div className="flex items-center gap-2">
            <div
              className="flex items-center justify-center size-10 bg-black/40 border border-white/10 rounded-xl shrink-0 select-none shadow-2xs"
              title="Indonesia"
            >
              <IndonesiaFlag className="w-5.5 h-3.5" />
            </div>
            <div className="relative flex-1">
              <Input
                id="tarik-ewallet-number"
                type="tel"
                inputMode="numeric"
                placeholder={config.placeholder}
                value={currentNumber}
                onChange={handleNumberChange}
                maxLength={PHONE_MAX_LENGTH}
                className={cn(
                  "font-mono text-sm h-10 bg-black/40 text-white border-white/10 focus:bg-black/60 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20",
                  hasStartedTyping && !phoneValid && "border-rose-500 focus-visible:ring-rose-500/30"
                )}
              />
            </div>
          </div>

          {isPrefixInvalid && (
            <p className="mt-1.5 text-[0.72rem] text-rose-400 font-semibold flex items-center gap-1.5">
              <AlertCircle className="size-3.5 shrink-0" />
              Angka depan harus diawali 08
            </p>
          )}
          {isTooShort && (
            <p className="mt-1.5 text-[0.72rem] text-amber-400 font-semibold flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 shrink-0" />
              Nomor kurang dari 10 digit (saat ini {currentNumber.length} digit, minimal 10 digit)
            </p>
          )}
          {phoneValid && !verifiedInquiry && (
            <p className="mt-1.5 text-[0.72rem] text-emerald-400 font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 shrink-0" />
              Format nomor DANA benar ({currentNumber.length} digit) — klik Cek Akun DANA untuk melihat nama pemilik
            </p>
          )}
          {!hasStartedTyping && (
            <p className="mt-1.5 text-[0.7rem] text-zinc-400">
              Nomor akun DANA harus diawali 08 dan memiliki 10–13 digit angka.
            </p>
          )}
        </div>

        {/* Kartu Hasil Verifikasi Account Inquiry DANA */}
        {verifiedInquiry && (
          <div className="rounded-2xl border border-emerald-500/35 bg-emerald-950/30 p-3.5 space-y-2 text-xs animate-fade-up">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-extrabold text-emerald-300">
                <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
                Akun DANA Terverifikasi
              </span>
              {verifiedInquiry.env === "sandbox" && (
                <span className="rounded bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-300">
                  SANDBOX
                </span>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-emerald-500/20 pt-2">
              <span className="text-zinc-300">Nama Pemilik DANA</span>
              <span className="font-extrabold text-white text-sm">
                {verifiedInquiry.customerName || "-"}
              </span>
            </div>
            <div className="flex items-center justify-between text-zinc-300">
              <span>Nomor Tujuan</span>
              <span className="font-mono font-semibold text-emerald-300">{currentNumber}</span>
            </div>
            <p className="text-[11px] text-zinc-300/90 pt-0.5 leading-relaxed">
              {withdrawAmount <= AUTO_DISBURSE_LIMIT
                ? "Pastikan nama pemilik akun DANA di atas sudah sesuai. Saldo akan langsung cair otomatis setelah Anda klik Konfirmasi."
                : "Nominal penarikan di atas Rp10.000 akan diverifikasi oleh Admin terlebih dahulu sebelum dicairkan ke akun DANA di atas."}
            </p>
          </div>
        )}

        {/* Rincian Penarikan */}
        <div className="rounded-2xl border border-white/10 bg-black/40 p-3.5 space-y-2 text-xs">
          <p className="font-bold text-white border-b border-white/10 pb-1.5">
            Rincian Penarikan
          </p>
          <div className="flex justify-between text-zinc-400">
            <span>Metode Penarikan</span>
            <span className="font-bold" style={{ color: config.brandColor }}>
              {config.name}
            </span>
          </div>
          <div className="flex justify-between text-zinc-400">
            <span>Saldo Ditarik</span>
            <span className="font-semibold text-white tabular-nums">
              {formatIDR(withdrawAmount)}
            </span>
          </div>
          {taxFee > 0 && (
            <div className="flex justify-between text-zinc-400">
              <span>Biaya Admin</span>
              <span className="font-semibold text-amber-400 tabular-nums">
                -{formatIDR(taxFee)}
              </span>
            </div>
          )}
          <div className="flex justify-between text-white font-bold border-t border-white/10 pt-2 text-[0.84rem]">
            <span>Estimasi Diterima</span>
            <span className="text-emerald-400 font-black tabular-nums">
              {formatIDR(netAmount)}
            </span>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (verifiedInquiry && !isLoading) {
                setVerifiedInquiry(null);
              } else {
                onClose();
              }
            }}
            disabled={isLoading || isInquiring}
            className="border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
          >
            {verifiedInquiry ? "Ubah" : "Batal"}
          </Button>

          {!verifiedInquiry ? (
            <Button
              type="button"
              onClick={handleCheckDanaAccount}
              disabled={!canProceed}
              leftIcon={
                isInquiring ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )
              }
              className={cn(
                "font-semibold transition-all",
                canProceed
                  ? "bg-gradient-to-r from-sky-400 to-blue-600 hover:from-sky-300 hover:to-blue-500 text-white shadow-md shadow-sky-500/25 cursor-pointer active:scale-98"
                  : "bg-white/5 border border-white/10 text-zinc-500 cursor-not-allowed shadow-none"
              )}
            >
              {isInquiring ? "Mengecek DANA..." : "Cek Akun DANA"}
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={!canProceed}
              leftIcon={
                isLoading ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <BanknoteArrowUp className="size-4" />
                )
              }
              className={cn(
                "font-semibold transition-all",
                canProceed
                  ? "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-md shadow-emerald-500/25 cursor-pointer active:scale-98"
                  : "bg-white/5 border border-white/10 text-zinc-500 cursor-not-allowed shadow-none"
              )}
            >
              {isLoading
                ? "Memproses..."
                : withdrawAmount <= AUTO_DISBURSE_LIMIT
                  ? "Konfirmasi & Cairkan Sekarang"
                  : "Ajukan Penarikan (> Rp10rb)"}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
