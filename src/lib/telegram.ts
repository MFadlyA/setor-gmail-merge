/**
 * Telegram integration module:
 * 1. User support reports and message building
 * 2. Real-time administrator notifications & OWASP A09 security alert dispatch
 */

/** Telegram caps a message at 4096 characters. */
export const MAX_DESCRIPTION = 2000;
export const MAX_SUBJECT = 100;
export const MAX_CATEGORY = 50;

/**
 * Escapes Markdown control characters in user input.
 *
 * The message is sent with `parse_mode: "Markdown"`. Without this, a `*` or `_`
 * in a report would open or close emphasis and Telegram answers 400
 * "can't parse entities", failing the submission through no fault of the user.
 * The template's own `*bold*` markers are added after escaping, so they survive.
 */
export function escapeMarkdown(value: string): string {
  return value.replace(/([_*`[\]\\])/g, "\\$1");
}

export interface ReportFields {
  kategori: string;
  judul: string;
  deskripsi: string;
}

/** Builds the Markdown body posted to `sendMessage`. */
export function buildReportMessage({
  kategori,
  judul,
  deskripsi,
}: ReportFields): string {
  return [
    "----------------------------------------",
    "🚨 *LAPORAN BARU - SETOR GMAIL WINTER*",
    "----------------------------------------",
    `📁 *Kategori:* ${escapeMarkdown(kategori)}`,
    `📝 *Judul:* ${escapeMarkdown(judul)}`,
    "💬 *Deskripsi:*",
    escapeMarkdown(deskripsi),
    "----------------------------------------",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Admin Notification & Security Alerts                               */
/* ------------------------------------------------------------------ */

import { readServerEnv } from "@/lib/supabase/admin";

function escapeTelegramHtml(raw: string): string {
  return String(raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = readServerEnv("TELEGRAM_BOT_TOKEN");
  const chatId = readServerEnv("TELEGRAM_CHAT_ID");

  if (!token || !chatId) {
    console.warn("Telegram bot token or chat ID is not configured.");
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });

    const data = await res.json();
    return !!data?.ok;
  } catch (err) {
    console.error("Failed to send telegram notification:", err);
    return false;
  }
}

/**
 * Dispatches real-time security alerts (OWASP A09: Logging & Monitoring)
 * Escapes all dynamic fields to prevent HTML injection or entity-parse alert suppression.
 */
export async function notifySecurityAlert(params: {
  title: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  action: string;
  ip: string;
  country?: string | null;
  userAgent?: string | null;
  userId?: string | null;
  email?: string | null;
  details?: string | null;
}) {
  const icon =
    params.severity === "CRITICAL"
      ? "🚨"
      : params.severity === "WARNING"
      ? "⚠️"
      : "🛡️";

  const safeTitle = escapeTelegramHtml(params.title);
  const safeAction = escapeTelegramHtml(params.action);
  const safeIp = escapeTelegramHtml(params.ip);
  const safeCountry = params.country ? `(${escapeTelegramHtml(params.country)})` : "";
  const safeActor = escapeTelegramHtml(
    params.email || params.userId || "Anonim / Tidak Terautentikasi"
  );
  const safeDetails = params.details
    ? `<b>Detail:</b> <i>${escapeTelegramHtml(params.details.slice(0, 800))}</i>\n`
    : "";
  const safeUa = params.userAgent
    ? `<b>User-Agent:</b> <code>${escapeTelegramHtml(params.userAgent.substring(0, 100))}</code>\n`
    : "";

  const message = `
<b>${icon} SECURITY ALERT: ${safeTitle} [${params.severity}]</b>
━━━━━━━━━━━━━━━━━━━━
<b>Aksi:</b> <code>${safeAction}</code>
<b>Waktu:</b> <code>${new Date().toISOString()}</code>
<b>IP Klien:</b> <code>${safeIp}</code> ${safeCountry}
<b>Akun:</b> ${safeActor}
${safeDetails}${safeUa}
<i>Admin Security Watchdog • setorgmail.com</i>
`.trim();

  return sendTelegramMessage(message);
}
