import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/security/rate-limiter";
import { validateCsrf } from "@/lib/security/csrf";
import { generateGmailCandidates } from "@/lib/gmail-check-shared";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rate = checkRateLimit(req, { maxRequests: 30, windowMs: 60_000 }, "gmail_generate_get");
  if (!rate.success) {
    return NextResponse.json(
      { success: false, error: "Terlalu banyak permintaan generate. Coba lagi sebentar." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds), "Cache-Control": "no-store" } }
    );
  }

  const countParam = req.nextUrl.searchParams.get("count");
  const count = countParam
    ? Math.max(1, Math.min(5, parseInt(countParam, 10) || 5))
    : 5;
  const { emails, timestampTail } = generateGmailCandidates(count);

  return NextResponse.json(
    {
      success: true,
      count: emails.length,
      timestamp_tail: timestampTail,
      emails,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}

export async function POST(req: NextRequest) {
  const csrf = validateCsrf(req);
  if (!csrf.valid) {
    return NextResponse.json(
      { success: false, error: "Validasi keamanan permintaan gagal." },
      { status: 403 }
    );
  }

  const rate = checkRateLimit(req, { maxRequests: 30, windowMs: 60_000 }, "gmail_generate_post");
  if (!rate.success) {
    return NextResponse.json(
      { success: false, error: "Terlalu banyak permintaan generate. Coba lagi sebentar." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds), "Cache-Control": "no-store" } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const count = body?.count
    ? Math.max(1, Math.min(5, parseInt(String(body.count), 10) || 5))
    : 5;
  const { emails, timestampTail } = generateGmailCandidates(count);

  return NextResponse.json(
    {
      success: true,
      count: emails.length,
      timestamp_tail: timestampTail,
      emails,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
