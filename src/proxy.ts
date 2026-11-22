import { NextRequest, NextResponse } from "next/server";
import { getAdminEmails as getWhitelistedAdminEmails } from "@/lib/admin-whitelist";

function getAdminEmails(): Set<string> {
  return new Set(getWhitelistedAdminEmails());
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com https://challenges.cloudflare.com https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https: https://*.supabase.co https://lh3.googleusercontent.com https://avatars.githubusercontent.com https://images.unsplash.com https://cdn.jsdelivr.net",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://accounts.google.com https://oauth2.googleapis.com https://api.telegram.org https://cloudflareinsights.com",
  "frame-src 'self' https://accounts.google.com https://challenges.cloudflare.com",
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
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), browsing-topics=()"
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
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

function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const jsonStr = atob(base64);
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Redirect legacy /admin/login directly to standard /login
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login")) {
    const loginUrl = new URL("/login", req.url);
    const err = req.nextUrl.searchParams.get("error");
    if (err) loginUrl.searchParams.set("error", err);
    return NextResponse.redirect(loginUrl);
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

      // Verify token payload and admin authorization
      const payload = decodeJwtPayload(token);
      const isExpired = payload?.exp && Date.now() / 1000 > payload.exp;
      const userEmail = (payload?.email || "").toLowerCase().trim();
      const adminEmails = getAdminEmails();
      const userRole = payload?.app_metadata?.role || payload?.user_metadata?.role;

      const isWhitelistedEmail = userEmail && adminEmails.has(userEmail);
      const hasAdminRole = userRole === "Admin" || userRole === "admin";
      const isAuthorized = !isExpired && (isWhitelistedEmail || hasAdminRole);

      if (!isAuthorized) {
        if (isAdminApiRoute) {
          const res = NextResponse.json(
            {
              success: false,
              error: isExpired
                ? "Akses ditolak: Sesi Anda telah kedaluwarsa. Silakan login kembali."
                : "Akses ditolak: Anda tidak memiliki hak akses Administrator.",
            },
            { status: isExpired ? 401 : 403 }
          );
          return applySecurityHeaders(res);
        }

        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set("error", isExpired ? "unauthorized" : "not_admin");
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
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
