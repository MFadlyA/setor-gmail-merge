"use client";

import * as React from "react";
import {
  KeyRound,
  Plus,
  Copy,
  Check,
  Shield,
  ChevronDown,
  CheckCircle2,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import {
  type TotpAccount,
  computeTotpCode,
  formatOtpCode,
  normalizeSecret,
  parseTotpSecretInput,
} from "@/lib/totp";
import { isValidStrictGmail } from "@/lib/security";

function TotpAccountTile({ account }: { account: TotpAccount }) {
  const [code, setCode] = React.useState("------");
  const [remaining, setRemaining] = React.useState(30);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    const tick = async () => {
      try {
        const res = await computeTotpCode(account.secret);
        if (active) {
          setCode(res.code);
          setRemaining(res.remaining);
        }
      } catch {
        if (active) {
          setCode("------");
        }
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [account.secret]);

  const handleCopy = async () => {
    if (!code || code === "------") return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(`Kode OTP ${formatOtpCode(code)} tersalin!`);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const progressPercent = (remaining / 30) * 100;
  const isExpiring = remaining <= 5;

  return (
    <div
      className={`relative rounded-xl border bg-gradient-to-b from-slate-900/90 to-slate-900/60 p-3.5 shadow-md transition-all ${
        isExpiring
          ? "border-amber-500/50 shadow-amber-500/10"
          : "border-white/10 hover:border-indigo-500/40"
      }`}
    >
      <div className="mb-1.5">
        <h4 className="font-mono font-bold text-white truncate text-xs sm:text-sm leading-tight">
          {account.email}
        </h4>
      </div>

      <div className="flex items-center justify-between gap-2 my-1">
        <span
          onClick={handleCopy}
          className="font-mono text-2xl sm:text-3xl font-extrabold tracking-wider select-all cursor-pointer text-amber-400 hover:text-amber-300 transition-colors leading-none"
        >
          {formatOtpCode(code)}
        </span>

        <button
          type="button"
          onClick={handleCopy}
          className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold transition-all cursor-pointer active:scale-95 shrink-0 ${
            copied
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-slate-800/90 hover:bg-indigo-600 text-slate-200 hover:text-white border border-slate-700/60"
          }`}
        >
          {copied ? (
            <>
              <Check className="size-3 text-emerald-400" />
              <span>Tersalin</span>
            </>
          ) : (
            <>
              <Copy className="size-3" />
              <span>Salin Kode</span>
            </>
          )}
        </button>
      </div>

      <div className="w-full bg-slate-800/80 rounded-full h-1 overflow-hidden mt-2">
        <div
          className="h-full transition-all duration-300 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}

function CustomEmailDropdown({
  emails,
  selected,
  onSelect,
}: {
  emails: string[];
  selected: string;
  onSelect: (email: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left transition-all cursor-pointer ${
          open
            ? "border-indigo-500/80 bg-[#0d101b] ring-2 ring-indigo-500/20 shadow-[0_0_20px_-6px_rgba(99,102,241,0.45)]"
            : "border-white/10 bg-black/60 hover:border-indigo-400/40 hover:bg-black/75"
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Mail className="size-3.5 text-indigo-400 shrink-0" />
          <span className="font-mono text-xs sm:text-sm text-white truncate">
            {selected || "Pilih akun Gmail..."}
          </span>
        </span>
        <ChevronDown
          className={`size-4 text-indigo-300 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && emails.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-2xl border border-indigo-500/35 bg-[#0c0f1a]/95 p-1.5 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.85),0_0_30px_-10px_rgba(99,102,241,0.35)] backdrop-blur-2xl max-h-60 overflow-y-auto">
          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-b border-white/5 mb-1 flex items-center justify-between">
            <span>Pilih Email Belum Ada 2FA</span>
            <span className="text-indigo-400 font-mono">{emails.length} sisa</span>
          </div>
          <div className="space-y-0.5">
            {emails.map((email) => {
              const isSelected = email.toLowerCase() === selected.toLowerCase();
              return (
                <button
                  key={email}
                  type="button"
                  onClick={() => {
                    onSelect(email);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left font-mono text-xs sm:text-[13px] transition-all cursor-pointer ${
                    isSelected
                      ? "bg-gradient-to-r from-indigo-500/25 to-violet-500/20 text-white border border-indigo-400/40 shadow-xs"
                      : "text-zinc-300 hover:bg-white/[0.06] hover:text-white border border-transparent"
                  }`}
                >
                  <span className="truncate">{email}</span>
                  {isSelected && <Check className="size-3.5 text-indigo-300 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface TotpGeneratorCardProps {
  mode: "fresh" | "old";
  candidateEmails: string[];
  accounts: TotpAccount[];
  onAddAccount: (account: TotpAccount) => void;
}

export function TotpGeneratorCard({
  mode,
  candidateEmails,
  accounts,
  onAddAccount,
}: TotpGeneratorCardProps) {
  const [selectedEmail, setSelectedEmail] = React.useState("");
  const [manualEmailInput, setManualEmailInput] = React.useState("");
  const [secretInput, setSecretInput] = React.useState("");

  // Email kandidat yang belum punya 2FA (otomatis hilang dari dropdown setelah dibuat)
  const availableEmails = React.useMemo(() => {
    const usedSet = new Set(accounts.map((a) => a.email.toLowerCase()));
    return candidateEmails.filter((email) => !usedSet.has(email.toLowerCase()));
  }, [candidateEmails, accounts]);

  // Sinkronkan pilihan dropdown otomatis ke email pertama yang tersedia
  React.useEffect(() => {
    if (availableEmails.length === 0) {
      setSelectedEmail("");
      return;
    }
    const stillAvailable = availableEmails.some(
      (e) => e.toLowerCase() === selectedEmail.toLowerCase()
    );
    if (!stillAvailable) {
      setSelectedEmail(availableEmails[0]);
    }
  }, [availableEmails, selectedEmail]);

  const max2fa = candidateEmails.length;
  const filledCount = candidateEmails.filter((email) =>
    accounts.some((a) => a.email.toLowerCase() === email.toLowerCase())
  ).length;
  const isAllCandidatesFilled = max2fa > 0 && availableEmails.length === 0;
  const useManualOldInput = mode === "old" && max2fa === 0;

  // Tampilkan hanya akun 2FA yang relevan (atau semua milik user saat ini)
  const visibleAccounts = accounts;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();

    let targetEmail = "";
    if (useManualOldInput) {
      const cleanManual = manualEmailInput.trim().toLowerCase();
      if (!isValidStrictGmail(cleanManual)) {
        toast.error("Format Gmail tidak valid", {
          description: "Masukkan alamat @gmail.com yang benar sebelum menambahkan 2FA.",
        });
        return;
      }
      if (accounts.some((a) => a.email.toLowerCase() === cleanManual)) {
        toast.error("Email ini sudah memiliki 2FA!");
        return;
      }
      if (accounts.length >= 10) {
        toast.error("Maksimal 10 akun 2FA sekaligus.");
        return;
      }
      targetEmail = cleanManual;
    } else {
      if (max2fa === 0) {
        toast.error("Generate Gmail terlebih dahulu di atas!");
        return;
      }
      if (availableEmails.length === 0 || !selectedEmail) {
        toast.error("Maksimal 2FA sesuai jumlah Gmail sudah terpenuhi.");
        return;
      }
      targetEmail = selectedEmail.toLowerCase().trim();
    }

    const parsedSecret = parseTotpSecretInput(secretInput);
    if (!parsedSecret) {
      toast.error("Secret Key tidak valid", {
        description:
          "Masukkan Secret Key Base32 dari Google Authenticator (contoh: JBSW Y3DP EHPK 3PXP).",
      });
      return;
    }

    // Secret key tidak boleh sama dengan email lain
    const duplicateSecretOwner = accounts.find(
      (a) => normalizeSecret(a.secret) === normalizeSecret(parsedSecret)
    );
    if (duplicateSecretOwner) {
      toast.error("Secret Key sudah dipakai email lain!", {
        description: `Secret Key ini sudah terdaftar untuk ${duplicateSecretOwner.email}. Gunakan Secret Key unik untuk setiap akun.`,
      });
      return;
    }

    const newAcc: TotpAccount = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      email: targetEmail,
      secret: parsedSecret,
    };
    onAddAccount(newAcc);
    setSecretInput("");
    if (useManualOldInput) setManualEmailInput("");
    toast.success(`2FA untuk ${targetEmail} berhasil ditambahkan!`);
  };

  return (
    <div className="relative z-30 rounded-3xl border border-white/10 bg-[#11131c]/90 p-4 sm:p-5 shadow-2xl backdrop-blur-2xl overflow-visible">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30">
            <Shield className="size-4" />
          </span>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight leading-none">
              Winter 2FA - TOTP
            </h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {mode === "fresh"
                ? "Pilih email hasil generate dan masukkan Secret Key 2FA dari Google sebelum setor."
                : "Wajib masukkan Secret Key 2FA dari Google untuk setiap email lama sebelum setor."}
            </p>
          </div>
        </div>

        {max2fa > 0 && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold border tabular-nums ${
              isAllCandidatesFilled
                ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300"
                : "bg-indigo-500/15 border-indigo-500/35 text-indigo-300"
            }`}
          >
            {isAllCandidatesFilled && <CheckCircle2 className="size-3.5 text-emerald-400" />}
            <span>
              {filledCount} / {max2fa} 2FA Terisi
            </span>
          </span>
        )}
      </div>

      {mode === "fresh" && max2fa === 0 ? (
        <div className="mt-3.5 rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-center text-xs text-zinc-400">
          Generate Gmail di atas terlebih dahulu untuk mengisi Secret Key 2FA (1 Gmail = 1 2FA).
        </div>
      ) : !isAllCandidatesFilled ? (
        <form onSubmit={handleAdd} className="mt-3.5 grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <div className="sm:col-span-5">
            {useManualOldInput ? (
              <div className="relative">
                <Mail className="size-3.5 text-indigo-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  value={manualEmailInput}
                  onChange={(e) => setManualEmailInput(e.target.value)}
                  placeholder="Ketik email@gmail.com..."
                  className="w-full rounded-xl border border-white/10 bg-black/50 pl-9 pr-3.5 py-2.5 text-xs sm:text-sm font-mono text-white placeholder:text-zinc-500 focus:border-indigo-500/70 focus:outline-none"
                />
              </div>
            ) : (
              <CustomEmailDropdown
                emails={availableEmails}
                selected={selectedEmail}
                onSelect={setSelectedEmail}
              />
            )}
          </div>

          <div className="sm:col-span-5 relative">
            <KeyRound className="size-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              placeholder="Secret Key dari Google..."
              className="w-full rounded-xl border border-white/10 bg-black/50 pl-9 pr-3.5 py-2.5 text-xs sm:text-sm font-mono text-white placeholder:text-zinc-500 focus:border-indigo-500/70 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="sm:col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-indigo-500/25 transition-all active:scale-[0.99] cursor-pointer"
          >
            <Plus className="size-4" />
            <span>2FA</span>
          </button>
        </form>
      ) : null}

      {visibleAccounts.length > 0 && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visibleAccounts.map((acc) => (
            <TotpAccountTile key={acc.id} account={acc} />
          ))}
        </div>
      )}
    </div>
  );
}
