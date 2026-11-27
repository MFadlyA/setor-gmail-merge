import { DisbursementApi } from "dana-node/disbursement/v1";
import { MerchantManagementApi } from "dana-node/merchant_management/v1";
import { DanaSignatureUtil, type InitOverrideFunction } from "dana-node/runtime";
import { readServerEnv } from "@/lib/supabase/admin";

export type DanaEnvironment = "sandbox" | "production";

export interface DanaServerConfig {
  env: DanaEnvironment;
  partnerId: string;
  clientSecret: string;
  privateKey: string;
  danaPublicKey: string;
  merchantId: string;
  origin: string;
  debugMode: string;
  isConfigured: boolean;
}

interface CachedDanaClients {
  fingerprint: string;
  disbursementApi: DisbursementApi;
  merchantManagementApi: MerchantManagementApi;
  config: DanaServerConfig;
}

let cachedClients: CachedDanaClients | null = null;

/**
 * Formats current time in Jakarta (WIB / GMT+7) as YYYY-MM-DDTHH:mm:ss+07:00
 * Pure UTC arithmetic so it works identically in Node.js and Cloudflare Workers (UTC).
 */
export function jakartaNow(date: Date = new Date()): string {
  const wibMs = date.getTime() + 7 * 60 * 60 * 1000;
  const wib = new Date(wibMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = wib.getUTCFullYear();
  const mm = pad(wib.getUTCMonth() + 1);
  const dd = pad(wib.getUTCDate());
  const hh = pad(wib.getUTCHours());
  const mi = pad(wib.getUTCMinutes());
  const ss = pad(wib.getUTCSeconds());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+07:00`;
}

/**
 * Reads DANA server configuration explicitly from Cloudflare Workers env / process.env.
 * Never relies on dotenv/config or filesystem paths.
 */
export function getDanaConfig(): DanaServerConfig {
  const rawEnv = (
    readServerEnv("DANA_ENV") ||
    readServerEnv("ENV") ||
    "sandbox"
  ).toLowerCase();

  const env: DanaEnvironment = rawEnv === "production" ? "production" : "sandbox";

  const partnerId =
    readServerEnv("DANA_X_PARTNER_ID") ||
    readServerEnv("X_PARTNER_ID") ||
    "";

  const clientSecret =
    readServerEnv("DANA_CLIENT_SECRET") ||
    readServerEnv("CLIENT_SECRET") ||
    "";

  const privateKey =
    readServerEnv("DANA_PRIVATE_KEY") ||
    readServerEnv("PRIVATE_KEY") ||
    "";

  const danaPublicKey =
    readServerEnv("DANA_PUBLIC_KEY") ||
    "";

  const merchantId =
    readServerEnv("DANA_MERCHANT_ID") ||
    "";

  const origin =
    readServerEnv("DANA_ORIGIN") ||
    readServerEnv("ORIGIN") ||
    "https://www.setorgmail.com";

  const rawDebug = readServerEnv("DANA_DEBUG") ?? readServerEnv("X_DEBUG");
  const debugMode =
    rawDebug !== undefined
      ? rawDebug.toLowerCase() === "true"
        ? "true"
        : "false"
      : env === "sandbox"
        ? "true"
        : "false";

  // Mirror DANA_ENV into process.env so dana-node's internal CustomValidation & WebhookParser
  // see the authoritative runtime environment on Cloudflare Workers.
  try {
    if (typeof process !== "undefined" && process.env) {
      process.env.DANA_ENV = env;
    }
  } catch {
    // Ignore if process.env is frozen in edge runtime
  }

  const isConfigured = Boolean(partnerId && privateKey && clientSecret);

  return {
    env,
    partnerId,
    clientSecret,
    privateKey,
    danaPublicKey,
    merchantId,
    origin,
    debugMode,
    isConfigured,
  };
}

export function isDanaConfigured(): boolean {
  return getDanaConfig().isConfigured;
}

/**
 * Cloudflare Workers runs in UTC where date-fns `XXX` outputs `'Z'` instead of `'+07:00'`.
 * DANA SNAP B2B requires explicit numeric timezone offset (`+07:00`) in `X-TIMESTAMP`.
 * This InitOverrideFunction ensures `X-TIMESTAMP` always uses `+07:00` and re-signs `X-SIGNATURE`.
 */
export function getSnapRequestOverride(privateKey: string): InitOverrideFunction {
  return async ({ init, context }) => {
    const headers = (init.headers || {}) as Record<string, string>;
    const existingTs = headers["X-TIMESTAMP"] || "";
    if (!existingTs || existingTs.endsWith("Z") || !existingTs.endsWith("+07:00")) {
      const wibTimestamp = jakartaNow();
      const bodyStr =
        typeof context.body === "string"
          ? context.body
          : JSON.stringify(context.body ?? {});
      const signature = DanaSignatureUtil.generateSnapB2BScenarioSignature(
        context.method,
        context.path,
        bodyStr,
        privateKey,
        wibTimestamp
      );
      headers["X-TIMESTAMP"] = wibTimestamp;
      headers["X-SIGNATURE"] = signature;
    }
    return {
      ...init,
      headers,
    };
  };
}

/**
 * Returns singleton DANA API clients initialized with explicit server env values.
 */
export function getDanaClients(): {
  disbursementApi: DisbursementApi;
  merchantManagementApi: MerchantManagementApi;
  config: DanaServerConfig;
  snapOverride: InitOverrideFunction;
} {
  const config = getDanaConfig();
  if (!config.isConfigured) {
    throw new Error(
      "Konfigurasi API DANA belum lengkap (DANA_X_PARTNER_ID, DANA_PRIVATE_KEY, DANA_CLIENT_SECRET)."
    );
  }

  const fingerprint = `${config.env}|${config.partnerId}|${config.origin}|${config.debugMode}|${config.privateKey.slice(-16)}|${config.clientSecret.slice(-8)}`;

  if (!cachedClients || cachedClients.fingerprint !== fingerprint) {
    const opts = {
      partnerId: config.partnerId,
      privateKey: config.privateKey,
      origin: config.origin,
      env: config.env,
      clientSecret: config.clientSecret,
      debugMode: config.debugMode,
    };

    cachedClients = {
      fingerprint,
      disbursementApi: new DisbursementApi(opts),
      merchantManagementApi: new MerchantManagementApi(opts),
      config,
    };
  }

  return {
    disbursementApi: cachedClients.disbursementApi,
    merchantManagementApi: cachedClients.merchantManagementApi,
    config: cachedClients.config,
    snapOverride: getSnapRequestOverride(config.privateKey),
  };
}
