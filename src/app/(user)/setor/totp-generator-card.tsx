"use client";

import * as React from "react";
import { KeyRound, Plus, Copy, Check, Shield, ChevronDown, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  type TotpAccount,
  computeTotpCode,
  formatOtpCode,
  normalizeSecret,
  parseTotpSecretInput,
} from "@/lib/totp";

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

interface TotpGeneratorCardProps {
  generatedEmails: string[];
  accounts: TotpAccount[];
  onAddAccount: (account: TotpAccount) => void;
}

export function TotpGeneratorCard({
  generatedEmails,
  accounts,
  onAddAccount,
}: TotpGeneratorCardProps) {
  const [selectedEmail, setSelectedEmail] = React.useState("");
  const [secretInput, setSecretInput] = React.useState("");

  // Email hasil generate yang belum punya 2FA (hilang dari dropdown setelah dibuat)
  const availableEmails = React.useMemo(() => {
    const usedSet = new Set(accounts.map((a) => a.email.toLowerCase()));
    return generatedEmails.filter((email) => !usedSet.has(email.toLowerCase()));
  }, [generatedEmails, accounts]);

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

  const max2fa = generatedEmails.length;
  const filledCount = generatedEmails.filter((email) =>
    accounts.some((a) => a.email.toLowerCase() === email.toLowerCase())
  ).length;
  const isAllGeneratedFilled = max2fa > 0 && availableEmails.length === 0;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();

    if (max2fa === 0) {
      toast.error("Generate Gmail terlebih dahulu di atas!");
      return;
    }

    if (availableEmails.length === 0 || !selectedEmail) {
      toast.error("Maksimal 2FA sesuai jumlah Gmail yang digenerate sudah terpenuhi.");
      return;
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

    const cleanEmail = selectedEmail.toLowerCase().trim();
    const newAcc: TotpAccount = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      email: cleanEmail,
      secret: parsedSecret,
    };
    onAddAccount(newAcc);
    setSecretInput("");
    toast.success(`2FA untuk ${cleanEmail} berhasil ditambahkan!`);
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-[#11131c]/90 p-4 sm:p-5 shadow-2xl backdrop-blur-2xl">
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
              Pilih email hasil generate dan masukkan Secret Key 2FA dari Google sebelum setor.
            </p>
          </div>
        </div>

        {max2fa > 0 && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold border tabular-nums ${
              isAllGeneratedFilled
                ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300"
                : "bg-indigo-500/15 border-indigo-500/35 text-indigo-300"
            }`}
          >
            {isAllGeneratedFilled && <CheckCircle2 className="size-3.5 text-emerald-400" />}
            <span>
              {filledCount} / {max2fa} 2FA Terisi
            </span>
          </span>
        )}
      </div>

      {max2fa === 0 ? (
        <div className="mt-3.5 rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-center text-xs text-zinc-400">
          Generate Gmail di atas terlebih dahulu untuk mengisi Secret Key 2FA (1 Gmail = 1 2FA).
        </div>
      ) : !isAllGeneratedFilled ? (
        <form onSubmit={handleAdd} className="mt-3.5 grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <div className="sm:col-span-5 relative">
            <select
              value={selectedEmail}
              onChange={(e) => setSelectedEmail(e.target.value)}
              className="w-full appearance-none rounded-xl border border-white/10 bg-black/60 pl-3.5 pr-9 py-2.5 text-xs sm:text-sm font-mono text-white focus:border-indigo-500/70 focus:outline-none cursor-pointer truncate"
            >
              {availableEmails.map((email) => (
                <option key={email} value={email} className="bg-zinc-950 text-white">
                  {email}
                </option>
              ))}
            </select>
            <ChevronDown className="size-4 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
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

      {accounts.length > 0 && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {accounts.map((acc) => (
            <TotpAccountTile key={acc.id} account={acc} />
          ))}
        </div>
      )}
    </div>
  );
}
