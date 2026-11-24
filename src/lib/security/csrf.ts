import { NextRequest } from "next/server";

const ALLOWED_ORIGINS = [
  "https://setorgmail.com",
  "https://www.setorgmail.com",
  "https://admin.setorgmail.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

if (process.env.NEXT_PUBLIC_SITE_URL) {
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL).origin;
    if (!ALLOWED_ORIGINS.includes(origin)) {
      ALLOWED_ORIGINS.push(origin);
    }
  } catch {}
}

function isAllowedOriginUrl(originStr: string): boolean {
  if (ALLOWED_ORIGINS.includes(originStr)) {
    return true;
  }
  // Strictly allow only HTTPS subdomains of setorgmail.com
  return /^https:\/\/[a-z0-9-]+\.setorgmail\.com$/i.test(originStr);
}

/**
 * Validates CSRF for state-modifying HTTP methods (POST, PATCH, PUT, DELETE)
 */
export function validateCsrf(req: NextRequest): { valid: boolean; reason?: string } {
  const method = req.method.toUpperCase();

  // Safe read-only methods do not modify server state
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return { valid: true };
  }

  // 0. Fetch Metadata Defense: explicitly block cross-site browser requests immediately
  const secFetchSite = req.headers.get("sec-fetch-site")?.toLowerCase();
  if (secFetchSite === "cross-site") {
    return { valid: false, reason: "Blocked by Sec-Fetch-Site: cross-site" };
  }

  // 1. Origin header check
  const origin = req.headers.get("origin");
  if (origin) {
    if (origin === req.nextUrl.origin || isAllowedOriginUrl(origin)) {
      return { valid: true };
    }
    return { valid: false, reason: `Untrusted Origin: ${origin}` };
  }

  // 2. Referer header fallback check
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (refererOrigin === req.nextUrl.origin || isAllowedOriginUrl(refererOrigin)) {
        return { valid: true };
      }
      return { valid: false, reason: `Untrusted Referer: ${referer}` };
    } catch {
      return { valid: false, reason: "Malformed Referer header" };
    }
  }

  // 3. Fallback when Origin & Referer are stripped: require explicit non-simple header or same-origin Fetch Metadata
  const xRequestedWith = req.headers.get("x-requested-with");
  const authHeader = req.headers.get("authorization");
  if (
    xRequestedWith === "XMLHttpRequest" ||
    (authHeader && authHeader.startsWith("Bearer ")) ||
    secFetchSite === "same-origin"
  ) {
    return { valid: true };
  }

  return { valid: false, reason: "Missing Origin, Referer, or custom anti-CSRF header" };
}

