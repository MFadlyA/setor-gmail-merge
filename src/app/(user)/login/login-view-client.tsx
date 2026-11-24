"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LandingView } from "@/app/(user)/landing-view";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { isKnownAdminEmail } from "@/lib/admin-whitelist";
import { Loader2 } from "lucide-react";

async function getPostAuthDestination(user?: any, token?: string): Promise<string> {
  if (!user) return "/";
  const email = (user.email || "").toLowerCase().trim();

  if (isKnownAdminEmail(email)) {
    if (token) {
      await fetch("/api/auth/admin-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Requested-With": "XMLHttpRequest",
        },
      }).catch(() => {});
    }
    return "/admin";
  }

  return "/";
}

export function LoginViewClient() {
  const router = useRouter();
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;

    async function verifyExistingAuth() {
      try {
        if (isSupabaseConfigured) {
          const { data } = await supabase.auth.getSession();
          if (data?.session?.user) {
            try {
              localStorage.setItem("setorgmail_auth", "true");
            } catch {}
            const dest = await getPostAuthDestination(data.session.user, data.session.access_token);
            window.location.href = dest;
            return;
          }
        }
        const localAuth =
          typeof window !== "undefined"
            ? localStorage.getItem("setorgmail_auth")
            : null;
        if (localAuth === "true") {
          window.location.href = "/";
          return;
        }
      } catch (err) {
        console.warn("Auth check error in login page:", err);
      } finally {
        if (isMounted) setChecking(false);
      }
    }

    verifyExistingAuth();

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#09090b]">
        <Loader2 className="size-8 animate-spin text-sky-400" />
      </div>
    );
  }

  return (
    <LandingView
      defaultModalMode="login"
      onAuthSuccess={async () => {
        try {
          const { data } = await supabase.auth.getSession();
          if (data?.session?.user) {
            const dest = await getPostAuthDestination(data.session.user, data.session.access_token);
            window.location.href = dest;
            return;
          }
        } catch {}
        window.location.href = "/";
      }}
    />
  );
}
