import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { readServerEnv } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/security/audit-logger";
import { runDanaReconciliation } from "@/lib/dana/reconcile";

export const dynamic = "force-dynamic";

function resolveCronSigningKey(): string {
  return (
    readServerEnv("CRON_SECRET") ||
    readServerEnv("DANA_CLIENT_SECRET") ||
    readServerEnv("CLIENT_SECRET") ||
    readServerEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    ""
  );
}

function timingSafeHexEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

function isAuthorizedCronRequest(req: NextRequest): boolean {
  // Option A: Explicit CRON_SECRET Bearer token
  const explicitCronSecret = readServerEnv("CRON_SECRET");
  const authHeader = req.headers.get("authorization") || "";
  if (explicitCronSecret && authHeader.startsWith("Bearer ")) {
    const provided = authHeader.slice(7).trim();
    if (
      provided.length === explicitCronSecret.length &&
      timingSafeHexEqual(provided, explicitCronSecret)
    ) {
      return true;
    }
  }

  // Option B: Internal Cloudflare Worker `scheduled()` HMAC-SHA256 signature
  const signingKey = resolveCronSigningKey();
  const tsHeader = (req.headers.get("x-cron-timestamp") || "").trim();
  const sigHeader = (req.headers.get("x-cron-signature") || "").trim().toLowerCase();

  if (!signingKey || !tsHeader || !sigHeader) {
    return false;
  }

  const tsMs = Number(tsHeader);
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60_000) {
    return false;
  }

  const expectedHex = crypto
    .createHmac("sha256", signingKey)
    .update(`dana-reconcile:${tsHeader}`)
    .digest("hex")
    .toLowerCase();

  return timingSafeHexEqual(sigHeader, expectedHex);
}

async function handleCron(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized cron invocation" },
      { status: 401 }
    );
  }

  try {
    const summary = await runDanaReconciliation({ limit: 25 });

    if (summary.checkedCount > 0) {
      await logAuditEvent({
        event: "WITHDRAWAL_STATUS_CHANGE",
        severity: "INFO",
        actorEmail: "system:cloudflare-cron",
        ip: "cloudflare-cron",
        details: {
          action: "AUTO_CRON_DANA_RECONCILE",
          schedule: req.headers.get("x-cron-schedule") || "*/5 * * * *",
          checkedCount: summary.checkedCount,
          settledSuccessCount: summary.settledSuccessCount,
          refundedCount: summary.refundedCount,
          stillPendingCount: summary.stillPendingCount,
        },
      });
    }

    return NextResponse.json(summary, {
      status: summary.success ? 200 : 200,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Cron reconciliation failed";
    console.error("[DANA_CRON_RECONCILE_ERROR]", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}

export async function GET(req: NextRequest) {
  return handleCron(req);
}
