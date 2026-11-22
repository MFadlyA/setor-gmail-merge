export const DEFAULT_ADMIN_EMAILS = [
  "komangabiw@gmail.com",
];

/**
 * Returns list of whitelisted admin emails from environment variables or defaults.
 * Works uniformly on both client-side and server-side.
 */
export function getAdminEmails(): string[] {
  const envEmails = (
    process.env.NEXT_PUBLIC_ADMIN_EMAILS ||
    process.env.ADMIN_EMAILS ||
    ""
  )
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_ADMIN_EMAILS, ...envEmails]));
}

/**
 * Checks whether an email address belongs to a whitelisted administrator.
 */
export function isKnownAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return getAdminEmails().includes(clean);
}
