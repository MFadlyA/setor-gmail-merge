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

/**
 * Fetches all rows from a Supabase table by paginating in chunks of 1000
 * to bypass PostgREST's default 1000-row response cap.
 */
export async function fetchAllRows<T = any>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000,
  maxRows = 50000
): Promise<{ data: T[]; error: any }> {
  const all: T[] = [];
  let from = 0;

  while (from < maxRows) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) {
      return { data: all, error };
    }
    if (!data || data.length === 0) {
      break;
    }
    all.push(...data);
    if (data.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  return { data: all, error: null };
}

/**
 * Fetches all Supabase Auth users across pages (1000 per page).
 */
export async function listAllAuthUsers(maxPages = 50): Promise<any[]> {
  const allUsers: any[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    const batch = res?.data?.users || [];
    if (batch.length === 0) break;
    allUsers.push(...batch);
    if (batch.length < 1000) break;
  }
  return allUsers;
}
