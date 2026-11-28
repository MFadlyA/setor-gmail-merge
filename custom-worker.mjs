import handler from "./.open-next/worker.js";

export {
  DOQueueHandler,
  DOShardedTagCache,
  BucketCachePurge,
} from "./.open-next/worker.js";

/**
 * Computes HMAC-SHA256 hex digest using Web Crypto API inside Cloudflare Workers.
 */
async function signCronPayload(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const workerEntrypoint = {
  fetch: handler.fetch,

  /**
   * Cloudflare Cron Trigger (every 5 minutes)
   * Automatically reconciles any uncertain/pending DANA disbursements (`status = 'diproses'`
   * with `dana_partner_reference_no IS NOT NULL`) without waiting for Admin manual action.
   */
  async scheduled(controller, env, ctx) {
    const signingKey =
      env?.CRON_SECRET ||
      env?.DANA_CLIENT_SECRET ||
      env?.CLIENT_SECRET ||
      env?.SUPABASE_SERVICE_ROLE_KEY ||
      "";

    if (!signingKey) {
      console.warn("[DANA_CRON] Skipping scheduled reconcile: no signing secret available in env.");
      return;
    }

    const runTask = async () => {
      try {
        const ts = String(Date.now());
        const sig = await signCronPayload(signingKey, `dana-reconcile:${ts}`);
        const origin = (env?.DANA_ORIGIN || env?.ORIGIN || "https://www.setorgmail.com").replace(/\/+$/, "");

        const req = new Request(`${origin}/api/cron/dana-reconcile`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-cron-timestamp": ts,
            "x-cron-signature": sig,
            "x-cron-schedule": controller?.cron || "*/5 * * * *",
          },
          body: "{}",
        });

        const res = await handler.fetch(req, env, ctx);
        if (!res.ok) {
          console.warn("[DANA_CRON] Reconcile returned non-200:", res.status);
        }
      } catch (err) {
        console.error("[DANA_CRON] Scheduled reconcile error:", err);
      }
    };

    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(runTask());
    } else {
      await runTask();
    }
  },
};

export default workerEntrypoint;
