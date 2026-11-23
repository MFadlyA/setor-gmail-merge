import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const DEFAULT_SUPABASE_URL = "https://kdjoeeehyahdgwgsfyal.supabase.co";
let clientInstance: SupabaseClient | null = null;
let cachedUrl = "";
let cachedKey = "";

function getCfEnvObject(): Record<string, unknown> | undefined {
  try {
    const ctx = getCloudflareContext({ async: false }) as { env?: Record<string, unknown> } | undefined;
    return ctx?.env;
  } catch {
    return undefined;
  }
}

export function readServerEnv(key: string): string | undefined {
  const cfEnv = getCfEnvObject();
  const cfVal = cfEnv?.[key];
  if (typeof cfVal === "string" && cfVal.trim().length > 0) {
    return cfVal.trim();
  }
  const procVal = process.env[key];
  if (typeof procVal === "string" && procVal.trim().length > 0) {
    return procVal.trim();
  }
  return undefined;
}

export function getCfEnvDiagnostics() {
  const keyFilter = /SUPA|ADMIN|TELE|NEXT|SERVICE|SECRET/i;
  const cfEnv = getCfEnvObject();
  const cfEnvKeys = cfEnv
    ? Object.keys(cfEnv)
        .filter((k) => keyFilter.test(k))
        .map((k) => `${k}(${typeof cfEnv[k]})`)
    : [];
  const processEnvKeys = Object.keys(process.env || {}).filter((k) => keyFilter.test(k));

  return {
    cfContextAvailable: Boolean(cfEnv),
    cfEnvKeys,
    processEnvKeys,
  };
}

export function getSupabaseAdminConfig() {
  const supabaseUrl =
    readServerEnv("SUPABASE_URL") ||
    readServerEnv("NEXT_PUBLIC_SUPABASE_URL") ||
    DEFAULT_SUPABASE_URL;

  const serviceRoleKey =
    readServerEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    readServerEnv("SUPABASE_SECRET_KEY") ||
    readServerEnv("SERVICE_ROLE_KEY") ||
    "";

  const anonKey = readServerEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") || "";

  return {
    supabaseUrl: supabaseUrl.trim(),
    apiKey: (serviceRoleKey || anonKey || "placeholder-key").trim(),
    anonKey: anonKey.trim(),
    hasServiceRoleKey: Boolean(serviceRoleKey),
  };
}

export function getSupabaseAdmin(): SupabaseClient {
  const { supabaseUrl, apiKey } = getSupabaseAdminConfig();

  if (!clientInstance || cachedUrl !== supabaseUrl || cachedKey !== apiKey) {
    cachedUrl = supabaseUrl;
    cachedKey = apiKey;
    clientInstance = createClient(supabaseUrl, apiKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return clientInstance;
}

// Service role client with admin privileges (server-side only)
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseAdmin();
    const value = (client as any)[prop];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
