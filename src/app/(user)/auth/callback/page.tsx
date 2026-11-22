"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { safeDecodeParam } from "@/lib/security";
import { isKnownAdminEmail } from "@/lib/admin-whitelist";
import { Loader2, ShieldCheck } from "lucide-react";

function syncAdminCookie(token?: string) {
  if (typeof document === "undefined" || !token) return;
  const isHttps = window.location.protocol === "https:";
  document.cookie = `sb-access-token=${token}; Path=/; SameSite=Lax${
    isHttps ? "; Secure" : ""
  }; max-age=86400`;
}

function CallbackHandler() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [statusText, setStatusText] = React.useState<string>(
    "Menghubungkan akun Google..."
  );
  const [isAdminDetected, setIsAdminDetected] = React.useState(false);

  React.useEffect(() => {
    let resolved = false;

    const resolveAndRedirect = async (user?: any, token?: string) => {
      if (resolved || !user) return;
      resolved = true;

      try {
        localStorage.setItem("setorgmail_auth", "true");
      } catch {}

      const userEmail = (user.email || "").toLowerCase().trim();
      const userRole = (
        user.app_metadata?.role ||
        user.user_metadata?.role ||
        ""
      ).toLowerCase();

      let isAdmin = isKnownAdminEmail(userEmail) || userRole === "admin";

      if (token) {
        syncAdminCookie(token);

        try {
          const res = await fetch("/api/auth/admin-check", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          });
          if (res.ok) {
            const checkData = await res.json();
            if (checkData.isAdmin) {
              isAdmin = true;
            }
          }
        } catch (apiErr) {
          console.warn("admin-check verification notice:", apiErr);
        }
      }

      if (isAdmin) {
        setIsAdminDetected(true);
        setStatusText("Akun Administrator terverifikasi! Mengarahkan ke Dashboard Admin...");
        window.location.href = "/admin";
        return;
      }

      setStatusText("Masuk berhasil! Mengarahkan ke beranda...");
      window.location.href = "/";
    };

    async function handleAuth() {
      try {
        // Parse both query search (?...) and hash fragment (#...)
        const searchParams = new URLSearchParams(window.location.search);
        const rawHash = window.location.hash.startsWith("#")
          ? window.location.hash.substring(1)
          : window.location.hash;
        const hashParams = new URLSearchParams(rawHash);

        // Check for error in query or hash
        const error = hashParams.get("error") || searchParams.get("error");
        const errorDescription =
          hashParams.get("error_description") ||
          searchParams.get("error_description");

        if (error || errorDescription) {
          console.error("[OAuth Error]", error, errorDescription);
          setErrorMessage(
            safeDecodeParam(errorDescription || error, 180) ||
              "Otentikasi Google gagal."
          );
          try {
            window.history.replaceState(null, "", window.location.pathname);
          } catch {}
          setTimeout(() => {
            window.location.href = "/login";
          }, 3500);
          return;
        }

        // 1. If access_token & refresh_token are in hash (Implicit Grant)
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          const { data, error: setSessionError } =
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
          if (!setSessionError && data?.session?.user) {
            await resolveAndRedirect(data.session.user, data.session.access_token);
            return;
          }
        }

        // 2. If code in query (PKCE flow)
        const code = searchParams.get("code");
        if (code) {
          const { data, error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (!exchangeError && data?.session?.user) {
            await resolveAndRedirect(data.session.user, data.session.access_token);
            return;
          }
        }

        // 3. Check existing session / onAuthStateChange
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user) {
          await resolveAndRedirect(
            sessionData.session.user,
            sessionData.session.access_token
          );
          return;
        }

        // 4. Listen for auth change
        const { data: listener } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            if (session?.user) {
              listener.subscription.unsubscribe();
              await resolveAndRedirect(session.user, session.access_token);
            }
          }
        );

        // Timeout fallback after 3.5 seconds
        setTimeout(async () => {
          if (!resolved) {
            const { data: finalCheck } = await supabase.auth.getSession();
            if (finalCheck?.session?.user) {
              await resolveAndRedirect(
                finalCheck.session.user,
                finalCheck.session.access_token
              );
            } else {
              window.location.href = "/";
            }
          }
        }, 3500);

        return () => {
          listener?.subscription?.unsubscribe();
        };
      } catch (err: any) {
        console.error("[Callback Exception]", err);
        setErrorMessage(
          err?.message || "Terjadi kesalahan saat memproses login Google."
        );
        setTimeout(() => {
          window.location.href = "/login";
        }, 3500);
      }
    }

    handleAuth();
  }, [router]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-4 text-center bg-[#07080d] text-white">
      <div
        className={`flex size-14 items-center justify-center rounded-2xl shadow-lg transition-colors ${
          isAdminDetected
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            : "bg-sky-500/10 text-sky-400 border border-sky-500/20"
        }`}
      >
        {isAdminDetected ? (
          <ShieldCheck className="size-8 animate-pulse text-emerald-400" />
        ) : (
          <Loader2 className="size-7 animate-spin" />
        )}
      </div>

      <p className="mt-4 text-base font-semibold text-zinc-100">
        {statusText}
      </p>

      {errorMessage ? (
        <div className="mt-3 rounded-lg bg-rose-950/40 border border-rose-500/30 p-3 max-w-sm">
          <p className="text-xs font-semibold text-rose-300">
            {errorMessage}
          </p>
          <p className="text-[11px] text-rose-400 mt-1">
            Mengalihkan kembali ke halaman utama...
          </p>
        </div>
      ) : (
        <p className="mt-1 text-xs text-zinc-400">
          Mohon tunggu sebentar, sesi login Anda sedang disinkronkan...
        </p>
      )}
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[#07080d]">
          <Loader2 className="size-7 animate-spin text-sky-400" />
        </div>
      }
    >
      <CallbackHandler />
    </React.Suspense>
  );
}
