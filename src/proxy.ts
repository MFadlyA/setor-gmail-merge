import { NextRequest, NextResponse } from "next/server";
import { getAdminEmails as getWhitelistedAdminEmails } from "@/lib/admin-whitelist";
import { getSupabaseAdminConfig } from "@/lib/supabase/admin";

function getAdminEmails(): Set<string> {
  return new Set(getWhitelistedAdminEmails());
}

const isDev = process.env.NODE_ENV === "development";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://accounts.google.com https://apis.google.com https://challenges.cloudflare.com https://static.cloudflareinsights.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https: https://*.supabase.co https://lh3.googleusercontent.com https://avatars.githubusercontent.com https://images.unsplash.com https://cdn.jsdelivr.net",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://accounts.google.com https://oauth2.googleapis.com https://cloudflareinsights.com",
  "frame-src 'self' https://accounts.google.com https://challenges.cloudflare.com https://www.youtube.com https://www.youtube-nocookie.com",
  "media-src 'self' https: blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-XSS-Protection", "0");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), browsing-topics=()"
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  return response;
}

function extractToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }

  const directCookie =
    req.cookies.get("sb-access-token")?.value ||
    req.cookies.get("sb-auth-token")?.value;
  if (directCookie) return directCookie;

  for (const cookie of req.cookies.getAll()) {
    if (cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token")) {
      try {
        const parsed = JSON.parse(decodeURIComponent(cookie.value));
        if (Array.isArray(parsed) && parsed[0]) return parsed[0];
        if (parsed?.access_token) return parsed.access_token;
      } catch {
        if (cookie.value) return cookie.value;
      }
    }
  }

  return null;
}

// Short-lived (15s) bounded cache keyed by SHA-256 digest of verified JWT (never stores raw token)
const verifiedAdminCache = new Map<
  string,
  { email: string; expiresAt: number }
>();

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Cryptographically verifies the JWT via Supabase Auth (/auth/v1/user).
 * NEVER trusts unverified base64 JWT payloads or user-writable user_metadata.role.
 */
async function verifyTokenWithSupabase(
  token: string
): Promise<{ valid: boolean; email?: string; expired?: boolean }> {
  try {
    const tokenDigest = await sha256Hex(token);
    const now = Date.now();
    const cached = verifiedAdminCache.get(tokenDigest);
    if (cached && cached.expiresAt > now) {
      return { valid: true, email: cached.email };
    }

    const { supabaseUrl, anonKey, apiKey } = getSupabaseAdminConfig();
    const key = anonKey || apiKey;
    if (!key || key === "placeholder-key") {
      return { valid: false };
    }

    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      verifiedAdminCache.delete(tokenDigest);
      return { valid: false, expired: res.status === 401 };
    }

    const userJson: any = await res.json();
    const email = String(userJson?.email || "").toLowerCase().trim();
    if (!email) {
      return { valid: false };
    }

    if (verifiedAdminCache.size >= 200) {
      const firstKey = verifiedAdminCache.keys().next().value;
      if (firstKey) verifiedAdminCache.delete(firstKey);
    }
    verifiedAdminCache.set(tokenDigest, { email, expiresAt: now + 15_000 });

    return { valid: true, email };
  } catch {
    return { valid: false };
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Enforce canonical www host on public/UI routes without interrupting /api/* webhooks
  const rawHost = (req.headers.get("host") || req.nextUrl.hostname || "")
    .toLowerCase()
    .replace(/:\d+$/, "");
  if (rawHost === "setorgmail.com" && !pathname.startsWith("/api/")) {
    const canonicalUrl = new URL(
      `${pathname}${req.nextUrl.search}`,
      "https://www.setorgmail.com"
    );
    const status = req.method === "GET" || req.method === "HEAD" ? 301 : 308;
    return applySecurityHeaders(NextResponse.redirect(canonicalUrl, status));
  }

  // Redirect legacy /admin/login directly to standard /login
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login")) {
    const loginUrl = new URL("/login", req.url);
    const err = req.nextUrl.searchParams.get("error");
    if (err) loginUrl.searchParams.set("error", err);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  // 1. Check if the route is an Admin UI or Admin API route
  const isAdminUiRoute = pathname.startsWith("/admin");
  const isAdminApiRoute = pathname.startsWith("/api/admin");

  if (isAdminUiRoute || isAdminApiRoute) {
    // Whitelist public admin routes (auth callback)
    const isPublicAdminRoute =
      pathname === "/admin/auth/callback" ||
      pathname.startsWith("/admin/auth/callback");

    if (!isPublicAdminRoute) {
      const token = extractToken(req);

      // No token provided
      if (!token) {
        if (isAdminApiRoute) {
          const res = NextResponse.json(
            {
              success: false,
              error: "Akses ditolak: Token autentikasi tidak ditemukan.",
            },
            { status: 401 }
          );
          return applySecurityHeaders(res);
        }

        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set("error", "unauthorized");
        const res = NextResponse.redirect(loginUrl);
        return applySecurityHeaders(res);
      }

      // Cryptographically verify token with Supabase Auth & strictly enforce admin email whitelist
      const verified = await verifyTokenWithSupabase(token);
      const adminEmails = getAdminEmails();
      const isAuthorized =
        verified.valid && Boolean(verified.email && adminEmails.has(verified.email));

      if (!isAuthorized) {
        const isUnauthenticated = !verified.valid;
        if (isAdminApiRoute) {
          const res = NextResponse.json(
            {
              success: false,
              error: isUnauthenticated
                ? "Akses ditolak: Sesi Anda tidak valid atau telah kedaluwarsa. Silakan login kembali."
                : "Akses ditolak: Anda tidak memiliki hak akses Administrator.",
            },
            { status: isUnauthenticated ? 401 : 403 }
          );
          return applySecurityHeaders(res);
        }

        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set("error", isUnauthenticated ? "unauthorized" : "not_admin");
        const res = NextResponse.redirect(loginUrl);
        return applySecurityHeaders(res);
      }
    }
  }

  // 2. Normal progression with security headers applied
  const response = NextResponse.next();
  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|ico)$).*)",
  ],
};
