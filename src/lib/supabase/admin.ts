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

function readCfEnv(key: string): string | undefined {
  const env = getCfEnvObject();
  const val = env?.[key];
  if (typeof val === "string" && val.trim().length > 0) {
    return val.trim();
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
    readCfEnv("SUPABASE_URL") ||
    readCfEnv("NEXT_PUBLIC_SUPABASE_URL") ||
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    DEFAULT_SUPABASE_URL;

  const serviceRoleKey =
    readCfEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    readCfEnv("SUPABASE_SECRET_KEY") ||
    readCfEnv("SERVICE_ROLE_KEY") ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    "";

  const anonKey =
    readCfEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";

  return {
    supabaseUrl: supabaseUrl.trim(),
    apiKey: (serviceRoleKey || anonKey || "placeholder-key").trim(),
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
