import { NextRequest, NextResponse } from "next/server";
import { WebhookParser } from "dana-node/webhook/v1";
import { getDanaConfig } from "@/lib/dana/client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/security/audit-logger";
import { getClientIp } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

/**
 * DANA Finish-Notify Webhook Endpoint (`POST /api/dana/finish-notify`)
 *
 * Important per DANA Disbursement to Balance specification:
 * - Required because Finish Payment URL is registered in DANA Merchant Portal.
 * - Verifies RSA-SHA256 signature over raw request body using DANA's public key.
 * - Logs payment notification and responds HTTP 200.
 * - Does NOT mutate withdrawal status (disbursement status is governed by
 *   `transferToDana` + `transferToDanaInquiryStatus`).
 */
export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  const rawBody = await req.text();

  if (!rawBody) {
    return NextResponse.json(
      { responseCode: "4005600", responseMessage: "Empty request body" },
      { status: 400 }
    );
  }

  const cfg = getDanaConfig();
  if (cfg.env === "production" && !cfg.danaPublicKey) {
    console.error("[DANA WEBHOOK] Missing DANA_PUBLIC_KEY in production environment");
    return NextResponse.json(
      { responseCode: "5005600", responseMessage: "Webhook public key not configured" },
      { status: 500 }
    );
  }

  const headersRecord: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headersRecord[key] = value;
  });

  let parser: WebhookParser;
  try {
    parser = new WebhookParser(cfg.danaPublicKey || undefined);
  } catch (err) {
    console.error("[DANA WEBHOOK] Failed to initialize WebhookParser:", err);
    return NextResponse.json(
      { responseCode: "5005600", responseMessage: "Webhook parser initialization error" },
      { status: 500 }
    );
  }

  // Try actual request pathname first, then DANA PG standard notify path fallback (see Spec E.2)
  const candidatePaths = Array.from(
    new Set([req.nextUrl.pathname || "/api/dana/finish-notify", "/api/dana/finish-notify", "/v1.0/debit/notify"])
  );

  let verifiedPayload: ReturnType<WebhookParser["parseWebhook"]> | null = null;
  let matchedPath = "";
  let lastVerifyErr: unknown = null;

  for (const candidatePath of candidatePaths) {
    try {
      verifiedPayload = parser.parseWebhook("POST", candidatePath, headersRecord, rawBody);
      matchedPath = candidatePath;
      break;
    } catch (err) {
      lastVerifyErr = err;
    }
  }

  if (!verifiedPayload) {
    console.warn("[DANA WEBHOOK] Signature verification failed:", {
      ip: clientIp,
      pathname: req.nextUrl.pathname,
      hasSignature: Boolean(headersRecord["x-signature"] || headersRecord["X-SIGNATURE"]),
      hasTimestamp: Boolean(headersRecord["x-timestamp"] || headersRecord["X-TIMESTAMP"]),
      error: lastVerifyErr instanceof Error ? lastVerifyErr.message : String(lastVerifyErr),
    });

    return NextResponse.json(
      { responseCode: "4015601", responseMessage: "Invalid Signature" },
      { status: 400 }
    );
  }

  // Best-effort persistence to dana_webhook_logs + audit_logs
  let parsedRawJson: Record<string, unknown> = {};
  try {
    parsedRawJson = JSON.parse(rawBody);
  } catch {
    parsedRawJson = { raw: rawBody };
  }

  try {
    await supabaseAdmin.from("dana_webhook_logs").insert({
      original_partner_reference_no: verifiedPayload.originalPartnerReferenceNo || null,
      original_reference_no: verifiedPayload.originalReferenceNo || null,
      merchant_id: verifiedPayload.merchantId || null,
      latest_transaction_status: verifiedPayload.latestTransactionStatus || null,
      transaction_status_desc: verifiedPayload.transactionStatusDesc || null,
      amount_value: verifiedPayload.amount?.value || null,
      amount_currency: verifiedPayload.amount?.currency || null,
      raw_payload: parsedRawJson,
      verified_path: matchedPath,
    });
  } catch {
    // Non-blocking if dana_webhook_logs migration has not been applied yet
  }

  await logAuditEvent({
    event: "DANA_WEBHOOK_NOTIFY",
    severity: "INFO",
    ip: clientIp,
    details: {
      source: "DANA_FINISH_NOTIFY",
      verifiedPath: matchedPath,
      originalPartnerReferenceNo: verifiedPayload.originalPartnerReferenceNo,
      originalReferenceNo: verifiedPayload.originalReferenceNo,
      latestTransactionStatus: verifiedPayload.latestTransactionStatus,
      transactionStatusDesc: verifiedPayload.transactionStatusDesc,
      amount: verifiedPayload.amount,
    },
  });

  return NextResponse.json(
    {
      responseCode: "2005600",
      responseMessage: "Webhook received and verified.",
    },
    { status: 200 }
  );
}
