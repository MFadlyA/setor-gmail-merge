export interface TotpAccount {
  id: string;
  email: string;
  secret: string;
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function normalizeSecret(raw: string): string {
  return String(raw || "")
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/=+$/, "");
}

export function isValidBase32Secret(raw: string): boolean {
  const clean = normalizeSecret(raw);
  return /^[A-Z2-7]{6,}$/.test(clean);
}

export function parseTotpSecretInput(input: string): string | null {
  const trimmed = String(input || "").trim();
  if (!trimmed) return null;

  if (/^otpauth:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const secretParam = url.searchParams.get("secret");
      if (secretParam) {
        const clean = normalizeSecret(secretParam);
        if (isValidBase32Secret(clean)) return clean;
      }
    } catch {}
  }

  if (trimmed.includes("|")) {
    const parts = trimmed.split("|").map((p) => p.trim());
    for (const part of parts) {
      const clean = normalizeSecret(part);
      if (/^[A-Z2-7]{10,}$/.test(clean)) return clean;
    }
  }

  const clean = normalizeSecret(trimmed);
  return isValidBase32Secret(clean) ? clean : null;
}

function decodeBase32(base32: string): Uint8Array {
  const clean = normalizeSecret(base32);
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
}

export async function computeTotpCode(
  secret: string,
  timestampMs = Date.now()
): Promise<{ code: string; remaining: number }> {
  const clean = normalizeSecret(secret);
  const nowSec = Math.floor(timestampMs / 1000);
  const counter = Math.floor(nowSec / 30);
  const remaining = 30 - (nowSec % 30);

  const secretBytes = decodeBase32(clean);
  if (secretBytes.byteLength === 0) {
    return { code: "------", remaining };
  }

  const keyBuffer = new ArrayBuffer(secretBytes.byteLength);
  new Uint8Array(keyBuffer).set(secretBytes);

  const key = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const counterBuf = new ArrayBuffer(8);
  const view = new DataView(counterBuf);
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  view.setUint32(4, counter >>> 0, false);

  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBuf));
  const offset = sig[sig.length - 1] & 0x0f;
  const binary =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);

  const code = String(binary % 1_000_000).padStart(6, "0");
  return { code, remaining };
}

export function formatOtpCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}
