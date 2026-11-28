import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/security/auth-guard";
import { sanitizeString } from "@/lib/security/sanitize";
import { logAuditEvent } from "@/lib/security/audit-logger";

const ALLOWED_ACTIONS = new Set([
  "REVEAL_PASSWORD",
  "COPY_PASSWORD",
  "REVEAL_SECRET",
  "COPY_SECRET",
  "REVEAL_OTP",
  "COPY_OTP",
  "REVEAL_CONTACT",
  "COPY_CONTACT",
]);

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response!;

  try {
    const body = await req.json().catch(() => ({}));
    const action = sanitizeString(body?.action, 40).toUpperCase();
    const targetId = sanitizeString(body?.targetId, 100);
    const targetLabel = body?.targetLabel
      ? sanitizeString(body.targetLabel, 150)
      : undefined;

    if (!ALLOWED_ACTIONS.has(action) || !targetId) {
      return NextResponse.json(
        { success: false, error: "Action atau targetId tidak valid" },
        { status: 400 }
      );
    }

    await logAuditEvent({
      event: "ADMIN_CREDENTIAL_ACCESS",
      severity: "INFO",
      actorId: auth.user?.id,
      actorEmail: auth.user?.email,
      targetId,
      ip: auth.clientIp,
      country: auth.country,
      details: {
        action,
        ...(targetLabel ? { targetLabel } : {}),
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "Gagal mencatat audit aksi admin" },
      { status: 500 }
    );
  }
}
