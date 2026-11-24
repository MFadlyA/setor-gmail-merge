import { NextRequest, NextResponse } from "next/server";
import { validateCsrf } from "@/lib/security/csrf";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const csrf = validateCsrf(req);
  if (!csrf.valid) {
    return NextResponse.json(
      { success: false, error: "Validasi CSRF gagal." },
      { status: 403 }
    );
  }

  const isHttps = req.nextUrl.protocol === "https:";
  const res = NextResponse.json({ success: true });

  res.cookies.set("sb-access-token", "", {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  res.cookies.set("sb-auth-token", "", {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return res;
}
