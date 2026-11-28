"use client";

import * as React from "react";
import { Copy, Check } from "lucide-react";
import { computeTotpCode, formatOtpCode, isValidBase32Secret } from "@/lib/totp";

export function AdminLiveOtpCell({
  secret,
  onCopy,
}: {
  secret?: string | null;
  onCopy?: () => void;
}) {
  const [code, setCode] = React.useState("------");
  const [remaining, setRemaining] = React.useState(30);
  const [copied, setCopied] = React.useState(false);

  const valid = Boolean(secret && secret !== "-" && isValidBase32Secret(secret));

  React.useEffect(() => {
    if (!valid || !secret) {
      setCode("------");
      return;
    }

    let active = true;
    const update = async () => {
      try {
        const res = await computeTotpCode(secret);
        if (active) {
          setCode(res.code);
          setRemaining(res.remaining);
        }
      } catch {
        if (active) setCode("------");
      }
    };

    update();
    const timer = window.setInterval(update, 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [secret, valid]);

  if (!valid) {
    return <span className="text-zinc-500">-</span>;
  }

  const handleCopy = () => {
    if (!code || code === "------" || !navigator?.clipboard) return;
    navigator.clipboard.writeText(code);
    onCopy?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const isExpiring = remaining <= 5;

  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-950/30 px-2 py-1">
      <span
        onClick={handleCopy}
        title="Klik untuk salin kode OTP"
        className={`font-mono text-xs font-extrabold tracking-wider select-all cursor-pointer ${
          isExpiring ? "text-rose-300" : "text-amber-300"
        }`}
      >
        {formatOtpCode(code)}
      </span>
      <span className="font-mono text-[10px] text-zinc-400 tabular-nums w-5 text-right">
        {remaining}s
      </span>
      <button
        type="button"
        onClick={handleCopy}
        title="Salin OTP 2FA"
        className="p-0.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
      >
        {copied ? (
          <Check className="w-3 h-3 text-emerald-400" />
        ) : (
          <Copy className="w-3 h-3" />
        )}
      </button>
    </div>
  );
}
