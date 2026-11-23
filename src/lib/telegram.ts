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

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

export async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID;

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

  const message = `
<b>${icon} SECURITY ALERT: ${params.title} [${params.severity}]</b>
━━━━━━━━━━━━━━━━━━━━
<b>Aksi:</b> <code>${params.action}</code>
<b>Waktu:</b> <code>${new Date().toISOString()}</code>
<b>IP Klien:</b> <code>${params.ip}</code> ${params.country ? `(${params.country})` : ""}
<b>Akun:</b> ${params.email || params.userId || "Anonim / Tidak Terautentikasi"}
${params.details ? `<b>Detail:</b> <i>${params.details}</i>\n` : ""}${params.userAgent ? `<b>User-Agent:</b> <code>${params.userAgent.substring(0, 100)}</code>\n` : ""}
<i>Admin Security Watchdog • setorgmail.com</i>
`.trim();

  return sendTelegramMessage(message);
}
