import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminConfig, readServerEnv } from "@/lib/supabase/admin";
import { isKnownAdminEmail } from "@/lib/admin-whitelist";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const searchParams = req.nextUrl.searchParams;

  const oauthError = searchParams.get("error");
  if (oauthError) {
    const errDesc = searchParams.get("error_description") || oauthError;
    return NextResponse.redirect(
      `${origin}/?error=${encodeURIComponent(errDesc)}`
    );
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = req.cookies.get("g_oauth_state")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(
      `${origin}/?error=${encodeURIComponent("Sesi otentikasi Google tidak valid atau kedaluwarsa. Silakan coba lagi.")}`
    );
  }

  const googleClientId = readServerEnv("GOOGLE_CLIENT_ID");
  const googleClientSecret = readServerEnv("GOOGLE_CLIENT_SECRET");
  if (!googleClientId || !googleClientSecret) {
    return NextResponse.redirect(
      `${origin}/?error=${encodeURIComponent("Konfigurasi Google OAuth server belum lengkap.")}`
    );
  }

  try {
    const redirectUri = `${origin}/api/auth/google/callback`;

    // 1. Exchange authorization code with Google for id_token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenJson: any = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson?.id_token) {
      const msg =
        tokenJson?.error_description ||
        tokenJson?.error ||
        "Gagal menukar kode otorisasi Google.";
      return NextResponse.redirect(
        `${origin}/?error=${encodeURIComponent(msg)}`
      );
    }

    // 2. Sign in to Supabase Auth using the verified Google id_token
    const { supabaseUrl, apiKey, anonKey } = getSupabaseAdminConfig();
    const supabaseApiKey = anonKey || apiKey;

    const sbRes = await fetch(
      `${supabaseUrl}/auth/v1/token?grant_type=id_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseApiKey,
        },
        body: JSON.stringify({
          provider: "google",
          id_token: tokenJson.id_token,
        }),
      }
    );

    const sbJson: any = await sbRes.json();
    if (!sbRes.ok || !sbJson?.access_token || !sbJson?.refresh_token) {
      const msg =
        sbJson?.error_description ||
        sbJson?.msg ||
        sbJson?.error ||
        "Gagal memverifikasi akun Google di Supabase.";
      return NextResponse.redirect(
        `${origin}/?error=${encodeURIComponent(msg)}`
      );
    }

    // 3. Redirect to /auth/callback with session tokens in URL hash
    const hashParams = new URLSearchParams({
      access_token: sbJson.access_token,
      refresh_token: sbJson.refresh_token,
      token_type: "bearer",
    });

    const response = NextResponse.redirect(
      `${origin}/auth/callback#${hashParams.toString()}`
    );

    // Clear temporary CSRF state cookie
    response.cookies.set("g_oauth_state", "", {
      httpOnly: true,
      secure: origin.startsWith("https://"),
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    // Pre-sync admin cookie if admin email
    const userEmail = (sbJson?.user?.email || "").toLowerCase().trim();
    if (isKnownAdminEmail(userEmail)) {
      response.cookies.set("sb-access-token", sbJson.access_token, {
        httpOnly: false,
        secure: origin.startsWith("https://"),
        sameSite: "lax",
        path: "/",
        maxAge: 86400,
      });
    }

    return response;
  } catch (err: any) {
    console.error("[Google OAuth Callback Error]", err);
    return NextResponse.redirect(
      `${origin}/?error=${encodeURIComponent("Terjadi kendala saat menghubungkan akun Google.")}`
    );
  }
}
