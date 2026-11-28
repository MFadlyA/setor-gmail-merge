"use client";

import * as React from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { adminFetch } from "@/lib/api-client";

export type AdminCredentialAuditAction =
  | "REVEAL_PASSWORD"
  | "COPY_PASSWORD"
  | "REVEAL_SECRET"
  | "COPY_SECRET"
  | "REVEAL_OTP"
  | "COPY_OTP"
  | "REVEAL_CONTACT"
  | "COPY_CONTACT";

/**
 * Fires an asynchronous audit log call to `/api/admin/audit-action`.
 * Never blocks UI interaction.
 */
export function logAdminCredentialAction(
  action: AdminCredentialAuditAction,
  targetId: string,
  targetLabel?: string
): void {
  if (!targetId) return;
  adminFetch("/api/admin/audit-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, targetId, targetLabel }),
  }).catch(() => {});
}

/**
 * Masks Telegram usernames / WhatsApp phone numbers so full contact info is never
 * exposed directly in admin list rows (e.g. `0838••••7041` or `@wi••••re`).
 */
export function maskContactValue(value?: string | null): string {
  const clean = String(value || "").trim();
  if (!clean || clean === "-") return "-";
  if (clean.startsWith("@")) {
    if (clean.length <= 4) return `${clean.slice(0, 2)}••••`;
    return `${clean.slice(0, 3)}••••${clean.slice(-2)}`;
  }
  if (clean.length >= 8) {
    return `${clean.slice(0, 4)}••••${clean.slice(-4)}`;
  }
  if (clean.length >= 4) {
    return `${clean.slice(0, 2)}••••${clean.slice(-1)}`;
  }
  return "••••";
}

/**
 * Masked Password cell for admin tables.
 * Never renders the plaintext password into the DOM until the admin clicks Reveal.
 */
export function MaskedPasswordCell({
  password,
  depositId,
  gmail,
  toneClass = "text-emerald-300",
}: {
  password?: string | null;
  depositId: string;
  gmail?: string;
  toneClass?: string;
}) {
  const [revealed, setRevealed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const hasPassword = Boolean(password && password !== "-");
  if (!hasPassword || !password) {
    return <span className="text-zinc-500">-</span>;
  }

  const handleToggle = () => {
    const next = !revealed;
    setRevealed(next);
    if (next) {
      logAdminCredentialAction("REVEAL_PASSWORD", depositId, gmail);
    }
  };

  const handleCopy = () => {
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(password);
    logAdminCredentialAction("COPY_PASSWORD", depositId, gmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/80 px-2 py-0.5">
      <span
        className={`font-mono text-xs font-medium ${
          revealed ? `${toneClass} select-all` : "text-zinc-400 tracking-widest select-none"
        }`}
      >
        {revealed ? password : "••••••••"}
      </span>
      <button
        type="button"
        onClick={handleToggle}
        className="p-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
        title={revealed ? "Sembunyikan Password" : "Lihat Password"}
        aria-label={revealed ? "Sembunyikan Password" : "Lihat Password"}
      >
        {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className="p-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
        title="Salin Password"
        aria-label="Salin Password"
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
