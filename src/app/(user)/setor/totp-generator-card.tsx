"use client";

import * as React from "react";
import { KeyRound, Plus, Copy, Check, Trash2, Shield } from "lucide-react";
import { toast } from "sonner";

type TotpAccount = {
  id: string;
  label: string;
  secret: string;
};

const STORAGE_KEY = "setorgmail_totp_accounts_v1";
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function normalizeSecret(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
}

function parseSecretInput(input: string, fallbackLabel: string): { label: string; secret: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Support otpauth://totp/... URI
  if (/^otpauth:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const secretParam = url.searchParams.get("secret");
      if (secretParam) {
        const clean = normalizeSecret(secretParam);
        if (/^[A-Z2-7]{6,}$/.test(clean)) {
          const pathLabel = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
          return {
            label: fallbackLabel.trim() || pathLabel || "Akun Baru",
            secret: clean,
          };
        }
      }
    } catch {}
  }

  // Support "label | secret"
  if (trimmed.includes("|")) {
    const parts = trimmed.split("|").map((p) => p.trim());
    for (const part of parts) {
      const clean = normalizeSecret(part);
      if (/^[A-Z2-7]{10,}$/.test(clean)) {
        const other = parts.find((p) => p !== part) || "";
        return {
          label: fallbackLabel.trim() || other || "Akun Baru",
          secret: clean,
        };
      }
    }
  }

  // Plain Base32 secret
  const clean = normalizeSecret(trimmed);
  if (/^[A-Z2-7]{6,}$/.test(clean)) {
    return {
      label: fallbackLabel.trim() || "Akun Baru",
      secret: clean,
    };
  }

  return null;
}

function decodeBase32(base32: string): Uint8Array {
  const clean = normalizeSecret(base32);
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
}

async function computeHotp(secretBytes: Uint8Array, counter: number): Promise<string> {
  const keyBuffer = new ArrayBuffer(secretBytes.byteLength);
  new Uint8Array(keyBuffer).set(secretBytes);

  const key = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const counterBuf = new ArrayBuffer(8);
  const view = new DataView(counterBuf);
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  view.setUint32(0, high, false);
  view.setUint32(4, low, false);

  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBuf));
  const offset = sig[sig.length - 1] & 0x0f;
  const binary =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, "0");
}

function formatSixDigits(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

function TotpAccountTile({
  account,
  onDelete,
}: {
  account: TotpAccount;
  onDelete: (id: string) => void;
}) {
  const [code, setCode] = React.useState("------");
  const [nextCode, setNextCode] = React.useState("------");
  const [remaining, setRemaining] = React.useState(30);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const secretBytes = decodeBase32(account.secret);
    let lastCounter = -1;

    const tick = async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const counter = Math.floor(nowSec / 30);
      const rem = 30 - (nowSec % 30);
      if (active) setRemaining(rem);

      if (counter !== lastCounter) {
        lastCounter = counter;
        try {
          const [cur, nxt] = await Promise.all([
            computeHotp(secretBytes, counter),
            computeHotp(secretBytes, counter + 1),
          ]);
          if (active) {
            setCode(cur);
            setNextCode(nxt);
          }
        } catch {
          if (active) {
            setCode("------");
            setNextCode("------");
          }
        }
      }
    };

    tick();
    const timer = window.setInterval(tick, 500);
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
      toast.success(`Kode OTP ${formatSixDigits(code)} tersalin!`);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const progressPercent = (remaining / 30) * 100;
  const isExpiring = remaining <= 5;

  return (
    <div
      className={`group relative rounded-xl border bg-gradient-to-b from-slate-900/90 to-slate-900/60 p-3.5 shadow-md transition-all ${
        isExpiring
          ? "border-amber-500/50 shadow-amber-500/10"
          : "border-white/10 hover:border-indigo-500/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <h4 className="font-bold text-white truncate text-xs sm:text-sm leading-tight">
          {account.label}
        </h4>
        <button
          type="button"
          onClick={() => onDelete(account.id)}
          title="Hapus 2FA"
          className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 my-1">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <span
            onClick={handleCopy}
            className="font-mono text-2xl sm:text-3xl font-extrabold tracking-wider select-all cursor-pointer text-amber-400 hover:text-amber-300 transition-colors leading-none"
          >
            {formatSixDigits(code)}
          </span>
          <span className="text-[11px] sm:text-xs text-zinc-400 font-mono whitespace-nowrap">
            next <b className="text-zinc-300 font-normal">{formatSixDigits(nextCode)}</b>
          </span>
        </div>

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

export function TotpGeneratorCard() {
  const [nameInput, setNameInput] = React.useState("");
  const [secretInput, setSecretInput] = React.useState("");
  const [accounts, setAccounts] = React.useState<TotpAccount[]>([]);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setAccounts(parsed);
      }
    } catch {}
  }, []);

  const persist = (next: TotpAccount[]) => {
    setAccounts(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseSecretInput(secretInput, nameInput);
    if (!parsed) {
      toast.error("Secret Key tidak valid", {
        description: "Masukkan Secret Key Base32 dari Google Authenticator (contoh: JBSW Y3DP EHPK 3PXP).",
      });
      return;
    }

    const newAcc: TotpAccount = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: parsed.label,
      secret: parsed.secret,
    };
    persist([newAcc, ...accounts]);
    setNameInput("");
    setSecretInput("");
    toast.success(`2FA "${newAcc.label}" berhasil ditambahkan!`);
  };

  const handleDelete = (id: string) => {
    persist(accounts.filter((a) => a.id !== id));
    toast.info("Akun 2FA dihapus.");
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-[#11131c]/90 p-4 sm:p-5 shadow-2xl backdrop-blur-2xl">
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30">
            <Shield className="size-4" />
          </span>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight leading-none">
              Winter 2FA - TOTP
            </h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Masukkan Secret Key dari Google untuk menghasilkan kode OTP 6 digit.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleAdd} className="mt-3.5 grid grid-cols-1 sm:grid-cols-12 gap-2.5">
        <input
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Nama Akun (opsional)"
          className="sm:col-span-4 rounded-xl border border-white/10 bg-black/50 px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-zinc-500 focus:border-indigo-500/70 focus:outline-none"
        />
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
          className="sm:col-span-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-indigo-500/25 transition-all active:scale-[0.99] cursor-pointer"
        >
          <Plus className="size-4" />
          <span>2FA</span>
        </button>
      </form>

      {accounts.length > 0 && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {accounts.map((acc) => (
            <TotpAccountTile key={acc.id} account={acc} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
