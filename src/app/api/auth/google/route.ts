import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminConfig, readServerEnv } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const googleClientId = readServerEnv("GOOGLE_CLIENT_ID");
  const googleClientSecret = readServerEnv("GOOGLE_CLIENT_SECRET");

  // Seamless fallback to standard Supabase OAuth if custom Google OAuth secrets are not configured yet
  if (!googleClientId || !googleClientSecret) {
    const { supabaseUrl } = getSupabaseAdminConfig();
    const fallbackUrl = new URL(`${supabaseUrl}/auth/v1/authorize`);
    fallbackUrl.searchParams.set("provider", "google");
    fallbackUrl.searchParams.set("redirect_to", `${origin}/auth/callback`);
    fallbackUrl.searchParams.set("prompt", "select_account");
    return NextResponse.redirect(fallbackUrl.toString());
  }

  const state = crypto.randomUUID();
  const redirectUri = `${origin}/api/auth/google/callback`;

  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", googleClientId);
  googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", "openid email profile");
  googleAuthUrl.searchParams.set("prompt", "select_account");
  googleAuthUrl.searchParams.set("access_type", "online");
  googleAuthUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(googleAuthUrl.toString());
  response.cookies.set("g_oauth_state", state, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return response;
}
