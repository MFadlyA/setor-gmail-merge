"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Mail,
  Lock,
  User as UserIcon,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  CheckCircle2,
  X,
} from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput } from "@/components/ui/input";
import { PasswordStrength, type PasswordRule } from "@/components/ui/password-strength";
import { GoogleButton } from "./google-button";
import { Divider } from "./divider";

import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { isKnownAdminEmail } from "@/lib/admin-whitelist";

type AuthMode = "login" | "register" | "forgot";

const registerPasswordRules: PasswordRule[] = [
  { id: "length", label: "Minimal 6 karakter", test: (v) => v.length >= 6 },
  {
    id: "case",
    label: "Huruf besar dan kecil",
    test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v),
  },
  { id: "digit", label: "Angka", test: (v) => /\d/.test(v) },
  {
    id: "symbol",
    label: "Simbol (@, #, $, dll)",
    test: (v) => /[!-/:-@[-`{-~]/.test(v),
  },
];

const registerPasswordLabels = ["Kosong", "Lemah", "Cukup", "Bagus", "Kuat"];

const tabs = [
  { value: "login" as const, label: "Masuk" },
  { value: "register" as const, label: "Daftar" },
];

export interface AuthCardProps {
  onSuccess?: () => void;
  onClose?: () => void;
  isModal?: boolean;
  initialMode?: AuthMode;
}

async function syncServerAdminCookie(token?: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch("/api/auth/admin-check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    if (res.ok) {
      const json = await res.json();
      return Boolean(json?.isAdmin);
    }
  } catch {}
  return false;
}

async function getPostLoginRedirect(user?: any, token?: string): Promise<string> {
  if (!user) return "/";
  const userEmail = (user.email || "").toLowerCase().trim();
  if (isKnownAdminEmail(userEmail)) {
    await syncServerAdminCookie(token);
    return "/admin";
  }
  return "/";
}

export function AuthCard({
  onSuccess,
  onClose,
  isModal = false,
  initialMode = "login",
}: AuthCardProps = {}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<AuthMode>(initialMode);

  React.useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
    }
  }, [initialMode]);

  const [isLoading, setIsLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [loginForm, setLoginForm] = React.useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = React.useState({
    name: "",
    email: "",
    password: "",
  });
  const [forgotEmail, setForgotEmail] = React.useState("");
  const [isForgotSuccess, setIsForgotSuccess] = React.useState(false);

  const [isPasswordFocused, setIsPasswordFocused] = React.useState(false);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setErrors({});
    setIsPasswordFocused(false);
  };

  const onSuccessRef = React.useRef(onSuccess);
  React.useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  const handleGoogleCredential = React.useCallback(async (credential: string) => {
    setIsLoading(true);
    try {
      if (supabase) {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: credential,
        });

        if (error) {
          toast.error("Gagal Masuk dengan Google", {
            description: error.message,
          });
          setIsLoading(false);
          return;
        }

        if (data?.user) {
          const userEmail = (data.user.email || "").toLowerCase().trim();
          const isAdmin = isKnownAdminEmail(userEmail);

          if (isAdmin) {
            await syncServerAdminCookie(data.session?.access_token);

            try {
              localStorage.setItem("setorgmail_auth", "true");
            } catch {}

            toast.success("Selamat datang Administrator!", {
              description: "Mengarahkan ke Dashboard Admin...",
            });
            window.location.href = "/admin";
            return;
          }

          try {
            const { data: existingProfile } = await supabase
              .from("profiles")
              .select("id")
              .eq("id", data.user.id)
              .maybeSingle();

            if (!existingProfile) {
              const fullName =
                data.user.user_metadata?.full_name ||
                data.user.user_metadata?.name ||
                data.user.email?.split("@")[0] ||
                "Pengguna";

              await supabase.from("profiles").upsert(
                {
                  id: data.user.id,
                  name: fullName,
                  email: data.user.email || "",
                  role: "User",
                },
                { onConflict: "id", ignoreDuplicates: true }
              );
            }
          } catch (profileErr) {
            console.warn("Profile init notice:", profileErr);
          }

          try {
            localStorage.setItem("setorgmail_auth", "true");
          } catch {}

          toast.success("Masuk dengan Google berhasil!", {
            description: "Selamat datang kembali.",
          });

          const targetUrl = await getPostLoginRedirect(data.user, data.session?.access_token);
          if (targetUrl === "/admin") {
            window.location.href = "/admin";
            return;
          }
          if (onSuccessRef.current) {
            onSuccessRef.current();
          } else {
            window.location.href = targetUrl;
          }
          return;
        }
      }
    } catch (err: unknown) {
      console.error("Google ID Token sign-in error:", err);
      toast.error("Terjadi kendala saat autentikasi Google.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleGoogle = React.useCallback(async () => {
    setIsLoading(true);
    try {
      window.location.href = "/api/auth/google";
    } catch (err: unknown) {
      console.error("Google OAuth redirect error:", err);
      toast.error("Gagal Masuk dengan Google", {
        description: err instanceof Error ? err.message : "Terjadi kendala saat menghubungi Google OAuth.",
      });
      setIsLoading(false);
    }
  }, []);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!loginForm.email.trim()) nextErrors.email = "Email wajib diisi";
    if (!loginForm.password) nextErrors.password = "Password wajib diisi";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const cleanEmail = loginForm.email.trim().toLowerCase();

    // 1. Kebijakan Admin: Hanya diizinkan login melalui Akun Google
    if (isKnownAdminEmail(cleanEmail)) {
      toast.error("Akses Khusus Akun Google", {
        description: "Akun Administrator hanya dapat masuk menggunakan Akun Google. Silakan klik tombol Google di atas.",
        duration: 6000,
      });
      return;
    }

    setIsLoading(true);
    try {
      if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: loginForm.email.trim(),
          password: loginForm.password,
        });

        if (error) {
          toast.error("Gagal Masuk", {
            description: error.message.toLowerCase().includes("fetch")
              ? "Gagal terhubung ke Supabase. Pastikan koneksi internet stabil."
              : error.message,
          });
          setIsLoading(false);
          return;
        } else if (data?.user) {
          const userEmail = (data.user.email || "").toLowerCase().trim();

          // 2. Proteksi ganda jika akun admin mencoba login password
          if (isKnownAdminEmail(userEmail)) {
            await supabase.auth.signOut();
            try { localStorage.removeItem("setorgmail_auth"); } catch {}
            toast.error("Akses Khusus Akun Google", {
              description: "Akun Administrator wajib masuk menggunakan Akun Google demi keamanan. Silakan klik tombol Google di atas.",
              duration: 6000,
            });
            setIsLoading(false);
            return;
          }

          try {
            localStorage.setItem("setorgmail_auth", "true");
          } catch { }
          toast.success("Selamat datang kembali!", {
            description: "Berhasil masuk.",
          });
          const targetUrl = await getPostLoginRedirect(data.user, data.session?.access_token);
          if (targetUrl === "/admin") {
            window.location.href = "/admin";
            return;
          }
          if (onSuccess) {
            onSuccess();
          } else {
            window.location.href = targetUrl;
          }
          return;
        }
      }
    } catch (e: any) {
      console.warn("Supabase auth error:", e);
      toast.error("Gagal Menghubungi Database", {
        description: e?.message || "Terjadi kendala saat menghubungi server.",
      });
      setIsLoading(false);
      return;
    }

    if (isSupabaseConfigured) {
      setIsLoading(false);
      toast.error("Gagal Masuk", { description: "Tidak dapat memverifikasi kredensial." });
      return;
    }

    // Fallback mode jika offline / user mock
    if (isKnownAdminEmail(cleanEmail)) {
      setIsLoading(false);
      toast.error("Akses Khusus Akun Google", {
        description: "Akun Administrator hanya dapat masuk menggunakan Akun Google.",
      });
      return;
    }

    window.setTimeout(() => {
      setIsLoading(false);
      try {
        localStorage.setItem("setorgmail_auth", "true");
      } catch { }
      toast.success("Selamat datang kembali!", { description: "Berhasil masuk." });
      if (onSuccess) {
        onSuccess();
      } else {
        window.location.href = "/";
      }
    }, 600);
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!registerForm.name.trim()) nextErrors.name = "Nama wajib diisi";
    if (!registerForm.email.trim()) nextErrors.email = "Email wajib diisi";
    if (registerForm.password.length < 6)
      nextErrors.password = "Minimal 6 karakter";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const cleanEmail = registerForm.email.trim().toLowerCase();
    if (isKnownAdminEmail(cleanEmail)) {
      toast.error("Email Khusus Admin", {
        description: "Email ini terdaftar sebagai Administrator. Silakan masuk langsung menggunakan Akun Google.",
        duration: 6000,
      });
      return;
    }

    setIsLoading(true);
    try {
      if (supabase) {
        const { data, error } = await supabase.auth.signUp({
          email: registerForm.email.trim(),
          password: registerForm.password,
          options: {
            data: {
              name: registerForm.name.trim(),
            },
          },
        });

        if (error) {
          toast.error("Pendaftaran Gagal", { description: error.message });
          setIsLoading(false);
          return;
        } else if (data?.user) {
          // Buat entri profil default jika belum ada (wallet dibuat otomatis oleh trigger DB)
          try {
            await supabase.from("profiles").upsert(
              {
                id: data.user.id,
                name: registerForm.name.trim(),
                email: registerForm.email.trim(),
                role: "User",
              },
              { onConflict: "id", ignoreDuplicates: true }
            );
          } catch { }

          if (!data.session) {
            setIsLoading(false);
            toast.success("Pendaftaran berhasil!", {
              description: "Silakan periksa email kamu untuk verifikasi atau masuk ke akun.",
            });
            switchMode("login");
            return;
          }

          try {
            localStorage.setItem("setorgmail_auth", "true");
          } catch { }
          toast.success("Pendaftaran berhasil!", {
            description: "Akun kamu berhasil terdaftar.",
          });
          const targetUrl = await getPostLoginRedirect(data.user, data.session?.access_token);
          if (targetUrl === "/admin") {
            window.location.href = "/admin";
            return;
          }
          if (onSuccess) {
            onSuccess();
          } else {
            window.location.href = targetUrl;
          }
          return;
        }
      }
    } catch (e) {
      console.warn("Supabase auth register fallback active:", e);
    }

    if (isSupabaseConfigured) {
      setIsLoading(false);
      toast.error("Pendaftaran Gagal", { description: "Tidak dapat menghubungi layanan autentikasi." });
      return;
    }

    // Fallback
    window.setTimeout(() => {
      setIsLoading(false);
      try {
        localStorage.setItem("setorgmail_auth", "true");
      } catch { }
      toast.success("Pendaftaran berhasil!", { description: "Akun kamu siap digunakan." });
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/");
      }
    }, 600);
  };

  const handleForgotPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanEmail = forgotEmail.trim();
    if (!cleanEmail) {
      setErrors({ forgotEmail: "Email wajib diisi" });
      return;
    }
    const isEmailValid = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleanEmail);
    if (!isEmailValid) {
      setErrors({ forgotEmail: "Format email tidak valid" });
      return;
    }

    setIsLoading(true);
    setErrors({});
    try {
      // Validasi apakah email terdaftar di database
      try {
        const checkRes = await fetch("/api/auth/check-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({ email: cleanEmail }),
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.exists === false) {
            setErrors({
              forgotEmail: "Email tidak terdaftar di database. Silakan periksa kembali atau buat akun baru.",
            });
            toast.error("Email Tidak Terdaftar", {
              description: "Email ini belum terdaftar di Setor Gmail. Silakan daftar akun baru.",
            });
            setIsLoading(false);
            return;
          }
        }
      } catch {
        // Fallback jika terjadi gangguan jaringan cek email
      }

      if (supabase) {
        const redirectOrigin =
          typeof window !== "undefined" ? window.location.origin : "https://setorgmail.com";
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${redirectOrigin}/auth/callback?type=recovery`,
        });

        if (error) {
          let desc = error.message;
          if (desc.toLowerCase().includes("rate limit")) {
            desc =
              "Batas pengiriman email sistem tercapai (rate limit). Silakan tunggu beberapa menit.";
          }
          toast.error("Gagal Mengirim Link Reset", {
            description: desc,
          });
          setIsLoading(false);
          return;
        }
      }

      setIsForgotSuccess(true);
      toast.success("Tautan pemulihan dikirim!", {
        description: `Silakan periksa kotak masuk atau spam email ${cleanEmail}.`,
      });
    } catch {
      toast.error("Terjadi kendala saat mengirim email pemulihan.");
    } finally {
      setIsLoading(false);
    }
  };

  const cardBody = (
    <>
      {mode === "forgot" ? (
        <div className="animate-fade-in space-y-4">
          <div className="flex items-center justify-between pb-1">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="size-3.5" />
              <span>Kembali ke Masuk</span>
            </button>
            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full">
              Pemulihan Akun
            </span>
          </div>

          <div className="flex flex-col items-center text-center pt-1 pb-2">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400/20 to-blue-600/20 text-sky-400 border border-sky-400/30 mb-3 shadow-lg shadow-sky-500/10">
              <KeyRound className="size-6" />
            </span>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Lupa Kata Sandi?
            </h3>
            <p className="mt-1 text-xs text-zinc-400 max-w-xs leading-relaxed">
              Masukkan alamat email akun kamu. Kami akan mengirimkan tautan aman untuk membuat kata sandi baru.
            </p>
          </div>

          {isForgotSuccess ? (
            <div className="space-y-4 animate-fade-down">
              <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 text-center space-y-2">
                <CheckCircle2 className="size-8 text-emerald-400 mx-auto" />
                <h4 className="text-sm font-bold text-white">Tautan Terkirim!</h4>
                <p className="text-xs text-emerald-200/90 leading-relaxed">
                  Kami telah mengirimkan tautan reset kata sandi ke{" "}
                  <strong className="text-white font-mono break-all">{forgotEmail}</strong>.
                  Silakan buka email kamu dan periksa folder <strong>Kotak Masuk (Inbox)</strong> atau <strong>Spam</strong>.
                </p>
              </div>

              <Button
                type="button"
                size="lg"
                fullWidth
                onClick={() => switchMode("login")}
                className="bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold rounded-2xl h-11 cursor-pointer"
              >
                Sudah Reset? Masuk Sekarang
              </Button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <Input
                label="Email Akun Kamu"
                type="email"
                autoComplete="email"
                placeholder="nama@email.com"
                labelClassName="text-zinc-300 font-medium text-xs"
                className="!bg-zinc-900/80 !border-zinc-800 focus:!border-sky-500 focus:!bg-zinc-900/95 focus:!ring-sky-500/20 !text-white !placeholder:text-zinc-500 rounded-2xl"
                leftIcon={<Mail className="size-[1.05rem] text-zinc-400" aria-hidden="true" />}
                value={forgotEmail}
                error={errors.forgotEmail}
                onChange={(e) => {
                  setForgotEmail(e.target.value);
                  setErrors({});
                }}
              />

              <Button
                type="submit"
                size="lg"
                fullWidth
                isLoading={isLoading}
                rightIcon={<ArrowRight className="size-4" aria-hidden="true" />}
                className="mt-1 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold shadow-lg shadow-sky-500/25 border-0 rounded-2xl h-12 cursor-pointer"
              >
                Kirim Tautan Pemulihan
              </Button>
            </form>
          )}
        </div>
      ) : (
        <>
          <Tabs
            items={tabs}
            value={mode}
            onValueChange={switchMode}
            className="mb-6 bg-zinc-900/90 border border-zinc-800 p-1 rounded-full"
            indicatorClassName="bg-zinc-800 border border-white/10 shadow-md"
            activeClassName="text-white font-bold"
            inactiveClassName="text-zinc-400 hover:text-zinc-200 font-medium"
          />

          <div className="mb-4">
            <GoogleButton
              onSuccess={handleGoogleCredential}
              onFallbackClick={handleGoogle}
              isLoading={isLoading}
            />
            <Divider label="atau" />
          </div>

          {mode === "login" ? (
            <form key="login" onSubmit={handleLogin} className="animate-fade-in space-y-4">
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="nama@email.com"
                labelClassName="text-zinc-300 font-medium text-xs"
                className="!bg-zinc-900/80 !border-zinc-800 focus:!border-sky-500 focus:!bg-zinc-900/95 focus:!ring-sky-500/20 !text-white !placeholder:text-zinc-500 rounded-2xl"
                leftIcon={<Mail className="size-[1.05rem] text-zinc-400" aria-hidden="true" />}
                value={loginForm.email}
                error={errors.email}
                onChange={(e) =>
                  setLoginForm((f) => ({ ...f, email: e.target.value }))
                }
              />

              <PasswordInput
                label="Password"
                labelClassName="text-zinc-300 font-medium text-xs"
                className="!bg-zinc-900/80 !border-zinc-800 focus:!border-sky-500 focus:!bg-zinc-900/95 focus:!ring-sky-500/20 !text-white !placeholder:text-zinc-500 rounded-2xl"
                trailing={
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(loginForm.email);
                      setIsForgotSuccess(false);
                      setErrors({});
                      setMode("forgot");
                    }}
                    className="text-[0.75rem] font-semibold text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
                  >
                    Lupa Kata Sandi?
                  </button>
                }
                autoComplete="current-password"
                placeholder="••••••••"
                leftIcon={<Lock className="size-[1.05rem] text-zinc-400" aria-hidden="true" />}
                value={loginForm.password}
                error={errors.password}
                onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
              />

              <Button
                type="submit"
                size="lg"
                fullWidth
                isLoading={isLoading}
                rightIcon={<ArrowRight className="size-4" aria-hidden="true" />}
                className="mt-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold shadow-lg shadow-sky-500/25 border-0 rounded-2xl h-12 cursor-pointer"
              >
                Masuk
              </Button>
            </form>
          ) : (
            <form
              key="register"
              onSubmit={handleRegister}
              className="animate-fade-in space-y-3.5"
            >
          <Input
            label="Nama"
            autoComplete="name"
            placeholder="Nama lengkap"
            labelClassName="text-zinc-300 font-medium text-xs"
            className="!bg-zinc-900/80 !border-zinc-800 focus:!border-sky-500 focus:!bg-zinc-900/95 focus:!ring-sky-500/20 !text-white !placeholder:text-zinc-500 rounded-2xl"
            leftIcon={<UserIcon className="size-[1.05rem] text-zinc-400" aria-hidden="true" />}
            value={registerForm.name}
            error={errors.name}
            onChange={(e) =>
              setRegisterForm((f) => ({ ...f, name: e.target.value }))
            }
          />

          <Input
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="nama@email.com"
            labelClassName="text-zinc-300 font-medium text-xs"
            className="!bg-zinc-900/80 !border-zinc-800 focus:!border-sky-500 focus:!bg-zinc-900/95 focus:!ring-sky-500/20 !text-white !placeholder:text-zinc-500 rounded-2xl"
            leftIcon={<Mail className="size-[1.05rem] text-zinc-400" aria-hidden="true" />}
            value={registerForm.email}
            error={errors.email}
            onChange={(e) =>
              setRegisterForm((f) => ({ ...f, email: e.target.value }))
            }
          />

          <div className="space-y-1.5">
            <PasswordInput
              label="Password"
              autoComplete="new-password"
              placeholder="Minimal 6 karakter"
              labelClassName="text-zinc-300 font-medium text-xs"
              hintClassName="text-zinc-500 text-[0.72rem]"
              className="!bg-zinc-900/80 !border-zinc-800 focus:!border-sky-500 focus:!bg-zinc-900/95 focus:!ring-sky-500/20 !text-white !placeholder:text-zinc-500 rounded-2xl"
              leftIcon={<Lock className="size-[1.05rem] text-zinc-400" aria-hidden="true" />}
              value={registerForm.password}
              error={errors.password}
              onChange={(e) =>
                setRegisterForm((f) => ({ ...f, password: e.target.value }))
              }
              onFocus={() => setIsPasswordFocused(true)}
              onBlur={() => setIsPasswordFocused(false)}
              hint={
                isPasswordFocused || registerForm.password.length > 0
                  ? undefined
                  : "Gunakan kombinasi huruf dan angka"
              }
            />

            {(isPasswordFocused || registerForm.password.length > 0) && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-3.5 transition-all duration-200">
                <PasswordStrength
                  value={registerForm.password}
                  rules={registerPasswordRules}
                  labels={registerPasswordLabels}
                />
              </div>
            )}
          </div>

          <Button
            type="submit"
            size="lg"
            fullWidth
            isLoading={isLoading}
            rightIcon={<ArrowRight className="size-4" aria-hidden="true" />}
            className="mt-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold shadow-lg shadow-sky-500/25 border-0 rounded-2xl h-12 cursor-pointer"
          >
            Daftar Sekarang
          </Button>
        </form>
      )}
    </>
  )}
</>
  );

  const trustRow = (
    <div
      className="animate-fade-up mt-5 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 text-[0.72rem] text-zinc-400"
      style={{ animationDelay: "160ms" }}
    >
      <div className="flex items-center gap-1.5">
        <ShieldCheck className="size-3.5 text-emerald-400" aria-hidden="true" />
        <span>Aman &amp; terenkripsi</span>
      </div>
      <span aria-hidden="true" className="text-zinc-600">
        ·
      </span>
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-sky-400" aria-hidden="true" />
        <span>{mode === "login" ? "Belum punya akun?" : "Sudah punya akun?"}</span>
        <button
          type="button"
          onClick={() => switchMode(mode === "login" ? "register" : "login")}
          className="font-semibold text-sky-400 transition-colors hover:text-sky-300 cursor-pointer underline underline-offset-2"
        >
          {mode === "login" ? "Daftar gratis" : "Masuk sekarang"}
        </button>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="relative w-full p-5 sm:p-7 text-white">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors z-10 cursor-pointer"
            aria-label="Tutup dialog"
          >
            <X className="size-5" />
          </button>
        )}

        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-600 to-sky-400 text-white shadow-lg shadow-sky-500/25">
            <Mail className="size-4.5 sm:size-5 stroke-[2.2]" aria-hidden="true" />
          </span>
          <div className="flex items-baseline gap-1.5 text-lg sm:text-xl tracking-tight">
            <span className="font-black text-white tracking-tight">
              SETOR GMAIL
            </span>
            <span className="text-xs sm:text-sm font-bold text-zinc-400 lowercase">
              by
            </span>
            <span className="font-black tracking-tight bg-gradient-to-r from-sky-400 via-sky-300 to-cyan-300 bg-clip-text text-transparent">
              Winter
            </span>
          </div>
        </div>

        {cardBody}
        {trustRow}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-[#09090b] text-white">
      {/* Ambient background orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-20 size-72 rounded-full bg-sky-500/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/3 -right-24 size-80 rounded-full bg-blue-500/10 blur-3xl"
      />

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12 lg:justify-center lg:py-16">
        {/* Brand header */}
        <div className="animate-fade-up mb-7 flex items-center justify-center gap-2.5">
          <span className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-600 to-sky-400 text-white shadow-lg shadow-sky-500/25">
            <Mail className="size-4.5 sm:size-5 stroke-[2.2]" aria-hidden="true" />
          </span>
          <div className="flex items-baseline gap-1.5 text-lg sm:text-xl tracking-tight">
            <span className="font-black text-white tracking-tight">
              SETOR GMAIL
            </span>
            <span className="text-xs sm:text-sm font-bold text-zinc-400 lowercase">
              by
            </span>
            <span className="font-black tracking-tight bg-gradient-to-r from-sky-400 via-sky-300 to-cyan-300 bg-clip-text text-transparent">
              Winter
            </span>
          </div>
        </div>

        {/* Floating auth card */}
        <div className="animate-fade-up flex-1 lg:flex-none" style={{ animationDelay: "80ms" }}>
          <div className="rounded-3xl bg-[#111116] border border-white/10 p-5 shadow-[0_10px_40px_-12px_rgba(56,189,248,0.2)] sm:p-6 lg:p-7">
            {cardBody}
          </div>
        </div>

        {trustRow}
      </div>
    </div>
  );
}
