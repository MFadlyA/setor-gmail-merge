"use client";

import React, { useState, useEffect } from "react";
import {
  DollarSign,
  FileText,
  Megaphone,
  Share2,
  ShieldAlert,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Smartphone,
  Monitor,
  Copy,
  Check,
  Zap,
  Wrench,
  LogIn,
  UserPlus,
  Send,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Lock,
  MessageCircle,
  Home,
  History,
  User,
  Wallet,
  Target,
  Banknote,
  Users,
  PlayCircle,
  ArrowRight,
  ScrollText,
  Calendar,
  Mail,
} from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { DEFAULT_CONFIG, SiteConfig } from "@/lib/site-config";
import { adminFetch } from "@/lib/api-client";

type CmsTab =
  | "landing"
  | "rules"
  | "pricing"
  | "contacts"
  | "features";

type PreviewDevice = "desktop" | "mobile";

export default function CmsPage() {
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_CONFIG);
  const [savedSnapshot, setSavedSnapshot] = useState<string>(JSON.stringify(DEFAULT_CONFIG));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  // String state untuk input angka agar bisa diketik bebas tanpa panah counter (maks 6 digit)
  const [numericStrings, setNumericStrings] = useState<Record<string, string>>({});

  // Active form tab on the left: default Landing Page, langsung sinkron ke preview kanan
  const [activeTab, setActiveTab] = useState<CmsTab>("landing");

  // Device switcher for preview (default desktop agar langsung terlihat penuh seperti web user)
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");

  // Interactive controls within the live preview
  const [previewDepositMode, setPreviewDepositMode] = useState<"fresh" | "old">("fresh");
  const [previewSelectedCount, setPreviewSelectedCount] = useState<number>(5);
  const [previewCopiedPassword, setPreviewCopiedPassword] = useState(false);
  const [previewShowRulesDetail, setPreviewShowRulesDetail] = useState(false);
  const [previewWithdrawMethod, setPreviewWithdrawMethod] = useState<
    "DANA" | "GOPAY" | "OVO" | "SHOPEEPAY"
  >("GOPAY");

  const hasUnsavedChanges = React.useMemo(
    () => JSON.stringify(config) !== savedSnapshot,
    [config, savedSnapshot]
  );

  // Fetch initial configuration from database
  useEffect(() => {
    let isMounted = true;
    const fetchConfig = async () => {
      try {
        const res = await adminFetch("/api/admin/cms");
        const json = await res.json();
        if (json.success && json.config && isMounted) {
          setConfig(json.config);
          setSavedSnapshot(JSON.stringify(json.config));
          setNumericStrings({});
          setUpdatedAt(json.updatedAt || null);
        }
      } catch (err) {
        console.error("Gagal memuat konfigurasi CMS:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setSaveSuccess(null);
    setSaveError(null);

    try {
      const res = await adminFetch("/api/admin/cms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const json = await res.json();

      if (json.success) {
        const syncedConfig = json.config || config;
        setConfig(syncedConfig);
        setSavedSnapshot(JSON.stringify(syncedConfig));
        try {
          localStorage.setItem("setorgmail_cached_site_config_v1", JSON.stringify(syncedConfig));
        } catch {}
        setSaveSuccess("Perubahan berhasil disimpan & disinkronkan ke web user!");
        setUpdatedAt(json.updatedAt || new Date().toISOString());
        setTimeout(() => setSaveSuccess(null), 4000);
      } else {
        setSaveError(json.error || "Gagal menyimpan perubahan CMS");
      }
    } catch (err: any) {
      setSaveError(err?.message || "Terjadi kesalahan saat menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm("Kembalikan seluruh konfigurasi ke nilai default awal?")) {
      setConfig(DEFAULT_CONFIG);
      setNumericStrings({});
    }
  };

  const updateField = <K extends keyof SiteConfig>(key: K, value: SiteConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  // Helper untuk input angka: bebas ketik tanpa panah counter, dibatasi maksimal 6 digit (0 - 999.999)
  const getNumberValue = (key: keyof SiteConfig): string => {
    if (numericStrings[key] !== undefined) {
      return numericStrings[key];
    }
    const val = config[key];
    return typeof val === "number" ? String(val) : "";
  };

  const handleNumberChange = (
    key: keyof SiteConfig,
    raw: string,
    options?: { maxDigits?: number; min?: number; max?: number }
  ) => {
    const maxDigits = options?.maxDigits ?? 6;
    const digits = raw.replace(/\D/g, "").slice(0, maxDigits);
    setNumericStrings((prev) => ({ ...prev, [key]: digits }));
    if (digits === "") {
      updateField(key, (options?.min ?? 0) as any);
      return;
    }
    let parsed = parseInt(digits, 10);
    if (options?.max !== undefined && parsed > options.max) {
      parsed = options.max;
      setNumericStrings((prev) => ({ ...prev, [key]: String(parsed) }));
    }
    if (options?.min !== undefined && parsed < options.min) {
      parsed = options.min;
    }
    updateField(key, parsed as any);
  };

  const handleNumberBlur = (key: keyof SiteConfig) => {
    setNumericStrings((prev) => {
      if (prev[key] === undefined) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const setPresetNumber = (key: keyof SiteConfig, val: number) => {
    setNumericStrings((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    updateField(key, val as any);
  };

  const handleCopyPreviewPassword = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(config.default_password);
      setPreviewCopiedPassword(true);
      setTimeout(() => setPreviewCopiedPassword(false), 1500);
    }
  };

  // List e-wallet yang tersedia beserta status on/off dan pajaknya
  const ewalletList = React.useMemo(() => [
    {
      id: "DANA" as const,
      label: "DANA",
      active: config.is_dana_active,
      taxActive: config.tax_dana_active,
      tax: config.tax_dana_active ? config.tax_dana : 0,
    },
    {
      id: "GOPAY" as const,
      label: "GoPay",
      active: config.is_gopay_active,
      taxActive: config.tax_gopay_active,
      tax: config.tax_gopay_active ? config.tax_gopay : 0,
    },
    {
      id: "OVO" as const,
      label: "OVO",
      active: config.is_ovo_active,
      taxActive: config.tax_ovo_active,
      tax: config.tax_ovo_active ? config.tax_ovo : 0,
    },
    {
      id: "SHOPEEPAY" as const,
      label: "ShopeePay",
      active: config.is_shopeepay_active,
      taxActive: config.tax_shopeepay_active,
      tax: config.tax_shopeepay_active ? config.tax_shopeepay : 0,
    },
  ], [config]);

  const activeEwallets = React.useMemo(() => {
    return ewalletList.filter((item) => item.active);
  }, [ewalletList]);

  // Sync preview method jika metode yang sedang dipilih dimatikan
  useEffect(() => {
    if (activeEwallets.length > 0) {
      const isSelectedActive = activeEwallets.some((w) => w.id === previewWithdrawMethod);
      if (!isSelectedActive) {
        setPreviewWithdrawMethod(activeEwallets[0].id);
      }
    }
  }, [activeEwallets, previewWithdrawMethod]);

  // Helper for current withdraw tax in preview
  const previewTax = React.useMemo(() => {
    const selected = ewalletList.find((w) => w.id === previewWithdrawMethod);
    if (!selected || !selected.active || !selected.taxActive) return 0;
    return selected.tax;
  }, [ewalletList, previewWithdrawMethod]);

  const activeTabLabels: Record<CmsTab, string> = {
    landing: "Landing Page",
    rules: "Rules",
    pricing: "Harga",
    contacts: "Kontak",
    features: "Fitur",
  };

  const activeTabRoutes: Record<CmsTab, string> = {
    landing: "https://setorgmail.com",
    rules: "https://setorgmail.com/setor",
    pricing: "https://setorgmail.com",
    contacts: "https://setorgmail.com/laporan",
    features: "https://setorgmail.com",
  };

  // Keyboard shortcut Ctrl+S / Cmd+S to save CMS config
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!saving) {
          void handleSave();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, saving]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-zinc-400 gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
        <span className="text-sm font-medium">Memuat Pengaturan CMS &amp; Live Preview...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top CMS Status Header (honest status indicator only — primary Save & Reset live in the solid bottom bar) */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 backdrop-blur-xl transition-colors shadow-lg ${
          hasUnsavedChanges
            ? "border-amber-500/40 bg-zinc-900/90 shadow-amber-950/20"
            : "border-zinc-800/90 bg-zinc-900/85"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <Sparkles className="size-4.5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                CMS Editor &amp; Live Preview
              </h1>
              {saving ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/35 bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                  <RefreshCw className="size-3 animate-spin" />
                  Menyimpan...
                </span>
              ) : hasUnsavedChanges ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Belum disimpan
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  <CheckCircle2 className="size-3" />
                  Tersinkron
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 truncate">
              {updatedAt
                ? `Terakhir disimpan ${new Date(updatedAt).toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })} · Perubahan langsung terlihat di Live Preview`
                : "Edit teks, harga, rules, dan lihat hasilnya secara real-time di samping"}
            </p>
          </div>
        </div>

        <span className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/80 px-2.5 py-1 text-[10px] font-mono text-zinc-400">
          Shortcut: <kbd className="text-zinc-200 font-semibold">Ctrl+S</kbd>
        </span>
      </div>

      {/* Toast Notifications */}
      {saveSuccess && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/40 text-emerald-300 text-xs font-semibold animate-fade-down">
          <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {saveError && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl border border-rose-500/30 bg-rose-950/40 text-rose-300 text-xs font-semibold animate-fade-down">
          <AlertCircle className="size-4 text-rose-400 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Main Split Screen: Independent scroll on desktop (Editor kiri + Preview kanan) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch min-w-0 lg:h-[calc(100dvh-10.5rem)] lg:min-h-[540px] lg:overflow-hidden">
        {/* ========================================================= */}
        {/* SISI KIRI: FORM CONTROL CMS (Scroll Independen + Solid Bottom Bar) */}
        {/* ========================================================= */}
        <div className="lg:col-span-6 xl:col-span-6 lg:h-full lg:flex lg:flex-col min-w-0 min-h-0">
          <div className="flex-1 min-h-0 lg:overflow-y-auto lg:pr-2 space-y-4 pb-28">
          {/* Form Tabs Navigation - Always 1 Clean Horizontal Row */}
          <div className="grid grid-cols-5 gap-1.5 p-1.5 bg-zinc-900/85 border border-zinc-800/90 rounded-2xl shadow-sm">
            {[
              { key: "landing", label: "Landing", icon: Megaphone },
              { key: "rules", label: "Rules", icon: FileText },
              { key: "pricing", label: "Harga", icon: DollarSign },
              { key: "contacts", label: "Kontak", icon: Share2 },
              { key: "features", label: "Fitur", icon: ShieldAlert },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as CmsTab)}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2 py-2.5 text-xs font-semibold rounded-xl transition-all cursor-pointer text-center ${
                    isActive
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-950/40 font-bold"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            {/* TAB 1: LANDING PAGE */}
            {activeTab === "landing" && (
              <div className="bg-zinc-900/65 border border-zinc-800/90 rounded-2xl p-5 space-y-5 shadow-sm">
                <div className="pb-3 border-b border-zinc-800/80">
                  <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-400">
                      <Megaphone className="w-4 h-4" />
                    </span>
                    Teks Landing Page &amp; Banner Pengumuman
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Sesuaikan headline besar, subheadline, badge status, dan teks running ticker.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Hero Headline 3 Baris */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-300">
                        Headline Utama (3 Baris Teks Besar)
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <span className="text-[10px] text-zinc-500 block mb-1">Baris 1</span>
                        <input
                          type="text"
                          maxLength={300}
                          value={config.hero_headline_1}
                          onChange={(e) => updateField("hero_headline_1", e.target.value.slice(0, 300))}
                          placeholder="Ubah Akun"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 block mb-1">Baris 2</span>
                        <input
                          type="text"
                          maxLength={300}
                          value={config.hero_headline_2}
                          onChange={(e) => updateField("hero_headline_2", e.target.value.slice(0, 300))}
                          placeholder="Gmail Jadi"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 block mb-1">Baris 3 (Gradient Sky)</span>
                        <input
                          type="text"
                          maxLength={300}
                          value={config.hero_headline_3}
                          onChange={(e) => updateField("hero_headline_3", e.target.value.slice(0, 300))}
                          placeholder="Penghasilan"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-sky-400 font-bold focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Subheadline */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-300">
                        Subheadline (Penjelasan Singkat Bawah Headline)
                      </label>
                    </div>
                    <textarea
                      rows={2}
                      maxLength={300}
                      value={config.hero_subheadline}
                      onChange={(e) => updateField("hero_subheadline", e.target.value.slice(0, 300))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Platform Badge */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-300">
                        Micro-Badge Atas Headline
                      </label>
                    </div>
                    <input
                      type="text"
                      maxLength={300}
                      value={config.platform_badge}
                      onChange={(e) => updateField("platform_badge", e.target.value.slice(0, 300))}
                      placeholder="Platform Setor Gmail Terpercaya 2026"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Running Marquee Text */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-300">
                        Running Marquee Ticker (Pemisah dengan titik tengah &bull;)
                      </label>
                    </div>
                    <input
                      type="text"
                      maxLength={300}
                      value={config.marquee_text}
                      onChange={(e) => updateField("marquee_text", e.target.value.slice(0, 300))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Badge Pengumuman / Maintenance Status pada Showcase */}
                  <div className="pt-2 border-t border-zinc-800/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-white block">
                          Badge Pengumuman Showcase Card
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          Tampilkan lencana status (misal tahap pengembangan) pada kartu tengah.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateField("badge_status_active", !config.badge_status_active)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                          config.badge_status_active ? "bg-emerald-600" : "bg-zinc-800"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            config.badge_status_active ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>

                    {config.badge_status_active && (
                      <div className="space-y-1.5 animate-fade-down">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-semibold text-zinc-300">
                            Teks Pengumuman Badge
                          </label>
                        </div>
                        <input
                          type="text"
                          maxLength={300}
                          value={config.badge_status_text}
                          onChange={(e) => updateField("badge_status_text", e.target.value.slice(0, 300))}
                          placeholder="Platform sedang dalam tahap pengembangan"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-amber-300 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    )}
                  </div>

                  {/* Video Cara Kerja Landing Page */}
                  <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-200">
                        URL Video Cara Kerja (Landing Page)
                      </label>
                      <span className="text-[10px] font-mono text-sky-400">MP4 / YouTube</span>
                    </div>
                    <input
                      type="text"
                      maxLength={500}
                      value={config.landing_video_url || ""}
                      onChange={(e) => updateField("landing_video_url", e.target.value.slice(0, 500))}
                      placeholder="/cara-kerja.mp4 atau https://youtu.be/..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-sky-300 focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[10px] text-zinc-500 leading-relaxed">
                      Default: <code className="text-zinc-300">/cara-kerja.mp4</code>. Anda dapat menggantinya dengan tautan langsung file video (.mp4/.webm) atau tautan YouTube.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: RULES */}
            {activeTab === "rules" && (
              <div className="bg-zinc-900/65 border border-zinc-800/90 rounded-2xl p-5 space-y-5 shadow-sm">
                <div className="pb-3 border-b border-zinc-800/80">
                  <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400">
                      <FileText className="w-4 h-4" />
                    </span>
                    Rules Setoran &amp; Parameter Generator
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Atur password default yang wajib dipakai user serta teks aturan 2x2 grid dan detail aturan.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Default Password */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-300">
                        Password Wajib (Default Password)
                      </label>
                    </div>
                    <input
                      type="text"
                      maxLength={300}
                      value={config.default_password}
                      onChange={(e) => updateField("default_password", e.target.value.slice(0, 300))}
                      placeholder="winter1212"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[10px] text-zinc-500">
                      Password wajib yang disalin oleh user saat membuat akun Gmail di web user.
                    </p>
                  </div>

                  {/* 4 Cards Ringkas */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-zinc-300">1. Aturan Status</label>
                      </div>
                      <input
                        type="text"
                        maxLength={300}
                        value={config.rule_status}
                        onChange={(e) => updateField("rule_status", e.target.value.slice(0, 300))}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-zinc-300">2. Aturan Nama Akun</label>
                      </div>
                      <input
                        type="text"
                        maxLength={300}
                        value={config.rule_nama}
                        onChange={(e) => updateField("rule_nama", e.target.value.slice(0, 300))}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-zinc-300">3. Aturan Usia Akun</label>
                      </div>
                      <input
                        type="text"
                        maxLength={300}
                        value={config.rule_usia}
                        onChange={(e) => updateField("rule_usia", e.target.value.slice(0, 300))}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-zinc-300">4. Aturan Keamanan</label>
                      </div>
                      <input
                        type="text"
                        maxLength={300}
                        value={config.rule_keamanan}
                        onChange={(e) => updateField("rule_keamanan", e.target.value.slice(0, 300))}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Detail Aturan (4 baris penjelasan) */}
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-300">
                        4 Poin Penjelasan Detail Aturan (Dropdown Collapsible)
                      </label>
                    </div>
                    {config.rules_detail_text.map((text, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-[11px] font-bold text-zinc-300">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          maxLength={300}
                          value={text}
                          onChange={(e) => {
                            const newRules = [...config.rules_detail_text];
                            newRules[idx] = e.target.value.slice(0, 300);
                            updateField("rules_detail_text", newRules);
                          }}
                          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: HARGA & BATAS PENARIKAN */}
            {activeTab === "pricing" && (
              <div className="bg-zinc-900/65 border border-zinc-800/90 rounded-2xl p-5 space-y-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-zinc-800/80">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                        <DollarSign className="w-4 h-4" />
                      </span>
                      Harga Setoran &amp; Batas Penarikan
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      Atur tarif beli Gmail, batas minimal tarik, kuota penarikan harian user, serta pajak e-wallet.
                    </p>
                  </div>
                </div>

                {/* 1. Grid 2x2 Simetris: 2 Tarif Setoran + 2 Aturan Penarikan */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Card 1: Harga Gmail Fresh */}
                  <div className="flex flex-col justify-between rounded-2xl border border-zinc-800/90 bg-zinc-950/65 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold text-zinc-200 truncate">
                        Harga Gmail Baru
                      </label>
                      <span className="shrink-0 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                        Fresh / Good
                      </span>
                    </div>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-xs font-bold text-zinc-500 select-none">
                        Rp
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="1500"
                        value={getNumberValue("price_per_gmail")}
                        onChange={(e) => handleNumberChange("price_per_gmail", e.target.value)}
                        onBlur={() => handleNumberBlur("price_per_gmail")}
                        className="w-full h-10 bg-zinc-900/90 border border-zinc-800 rounded-xl pl-9 pr-3 text-sm font-mono font-bold text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                      />
                    </div>
                    <p className="text-[10.5px] text-zinc-500 leading-snug">
                      Tarif standar per akun Gmail baru hasil generate.
                    </p>
                  </div>

                  {/* Card 2: Harga Gmail Bebas */}
                  <div className="flex flex-col justify-between rounded-2xl border border-zinc-800/90 bg-zinc-950/65 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold text-zinc-200 truncate">
                        Harga Gmail Lama
                      </label>
                      <span className="shrink-0 rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-400">
                        Bebas
                      </span>
                    </div>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-xs font-bold text-zinc-500 select-none">
                        Rp
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="1000"
                        value={getNumberValue("price_bebas")}
                        onChange={(e) => handleNumberChange("price_bebas", e.target.value)}
                        onBlur={() => handleNumberBlur("price_bebas")}
                        className="w-full h-10 bg-zinc-900/90 border border-zinc-800 rounded-xl pl-9 pr-3 text-sm font-mono font-bold text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                      />
                    </div>
                    <p className="text-[10.5px] text-zinc-500 leading-snug">
                      Tarif per akun kategori Gmail lama / bebas.
                    </p>
                  </div>

                  {/* Card 3: Minimal Penarikan */}
                  <div className="flex flex-col justify-between rounded-2xl border border-zinc-800/90 bg-zinc-950/65 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold text-zinc-200 truncate">
                        Minimal Penarikan
                      </label>
                      <span className="shrink-0 rounded-md border border-zinc-700 bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-bold text-zinc-300">
                        Min. WD
                      </span>
                    </div>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-xs font-bold text-zinc-500 select-none">
                        Rp
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="5000"
                        value={getNumberValue("min_withdrawal")}
                        onChange={(e) =>
                          handleNumberChange("min_withdrawal", e.target.value, { min: 1000 })
                        }
                        onBlur={() => handleNumberBlur("min_withdrawal")}
                        className="w-full h-10 bg-zinc-900/90 border border-zinc-800 rounded-xl pl-9 pr-3 text-sm font-mono font-bold text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {[1000, 5000, 10000, 20000].map((preset) => {
                        const active = config.min_withdrawal === preset;
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setPresetNumber("min_withdrawal", preset)}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
                              active
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200"
                            }`}
                          >
                            Rp{preset / 1000}rb
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Card 4: Batas Penarikan Harian (Proteksi Keamanan Internal - Tersembunyi dari User) */}
                  <div className="flex flex-col justify-between rounded-2xl border border-zinc-800/90 bg-zinc-950/65 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold text-zinc-200 truncate">
                        Batas Penarikan / Hari
                      </label>
                      <span
                        className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-300"
                        title="Hanya aktif di backend keamanan, tidak ditampilkan ke user"
                      >
                        Proteksi Internal
                      </span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        placeholder="3"
                        value={getNumberValue("max_withdrawals_per_day")}
                        onChange={(e) =>
                          handleNumberChange("max_withdrawals_per_day", e.target.value, {
                            maxDigits: 2,
                            min: 1,
                            max: 50,
                          })
                        }
                        onBlur={() => handleNumberBlur("max_withdrawals_per_day")}
                        className="w-full h-10 bg-zinc-900/90 border border-zinc-800 rounded-xl pl-3.5 pr-16 text-sm font-mono font-bold text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                      />
                      <span className="absolute right-3 text-[11px] font-semibold text-zinc-400 select-none">
                        x / hari
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {[1, 2, 3, 5, 10].map((preset) => {
                        const active = config.max_withdrawals_per_day === preset;
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setPresetNumber("max_withdrawals_per_day", preset)}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
                              active
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200"
                            }`}
                          >
                            {preset}x
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 2. Metode Penarikan E-Wallet & Saklar Pajak */}
                <div className="pt-4 border-t border-zinc-800/80 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Wallet className="size-4 text-sky-400" />
                        Metode Penarikan E-Wallet &amp; Pajak
                      </h4>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Aktifkan e-wallet tujuan penarikan dan atur potongan biaya admin per transaksi.
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-950 px-2.5 py-1 text-[10.5px] font-bold text-zinc-300">
                      <span
                        className={`size-1.5 rounded-full ${
                          activeEwallets.length > 0 ? "bg-emerald-400" : "bg-rose-400"
                        }`}
                      />
                      {activeEwallets.length}/4 E-Wallet Aktif
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        key: "dana",
                        name: "DANA",
                        badgeBg: "bg-[#118EEA]/20 text-sky-300 border-[#118EEA]/40",
                        activeKey: "is_dana_active" as const,
                        taxActiveKey: "tax_dana_active" as const,
                        taxKey: "tax_dana" as const,
                      },
                      {
                        key: "gopay",
                        name: "GoPay",
                        badgeBg: "bg-[#00AED6]/20 text-cyan-300 border-[#00AED6]/40",
                        activeKey: "is_gopay_active" as const,
                        taxActiveKey: "tax_gopay_active" as const,
                        taxKey: "tax_gopay" as const,
                      },
                      {
                        key: "ovo",
                        name: "OVO",
                        badgeBg: "bg-purple-500/20 text-purple-300 border-purple-500/40",
                        activeKey: "is_ovo_active" as const,
                        taxActiveKey: "tax_ovo_active" as const,
                        taxKey: "tax_ovo" as const,
                      },
                      {
                        key: "shopeepay",
                        name: "ShopeePay",
                        badgeBg: "bg-orange-500/20 text-orange-300 border-orange-500/40",
                        activeKey: "is_shopeepay_active" as const,
                        taxActiveKey: "tax_shopeepay_active" as const,
                        taxKey: "tax_shopeepay" as const,
                      },
                    ].map((wallet) => {
                      const isMethodActive = Boolean(config[wallet.activeKey]);
                      const isTaxActive = Boolean(config[wallet.taxActiveKey]);

                      return (
                        <div
                          key={wallet.key}
                          className={`flex flex-col justify-between p-3.5 rounded-2xl border transition-all space-y-3 ${
                            isMethodActive
                              ? "bg-zinc-950/75 border-zinc-800/90 shadow-sm"
                              : "bg-zinc-950/35 border-zinc-900 opacity-65"
                          }`}
                        >
                          {/* Header: Nama E-Wallet & Saklar On/Off Metode */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`flex size-8 shrink-0 items-center justify-center rounded-xl border text-xs font-extrabold ${wallet.badgeBg}`}
                              >
                                {wallet.name[0]}
                              </span>
                              <div className="min-w-0">
                                <span className="text-xs font-bold text-white block truncate">
                                  {wallet.name}
                                </span>
                                <span
                                  className={`text-[10px] font-semibold whitespace-nowrap block ${
                                    isMethodActive ? "text-emerald-400" : "text-zinc-500"
                                  }`}
                                >
                                  {isMethodActive ? "● Aktif" : "○ Nonaktif"}
                                </span>
                              </div>
                            </div>

                            {/* Saklar Metode */}
                            <button
                              type="button"
                              onClick={() => updateField(wallet.activeKey, !isMethodActive)}
                              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                                isMethodActive ? "bg-emerald-600" : "bg-zinc-800"
                              }`}
                              aria-label={`Toggle metode ${wallet.name}`}
                            >
                              <span
                                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                  isMethodActive ? "translate-x-4.5" : "translate-x-1"
                                }`}
                              />
                            </button>
                          </div>

                          {/* Konten Ketika Metode Aktif */}
                          {isMethodActive ? (
                            <div className="pt-2.5 border-t border-zinc-800/70 space-y-2">
                              {/* Saklar Kena Pajak */}
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-semibold text-zinc-300 whitespace-nowrap">
                                  Biaya Admin / Pajak
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateField(wallet.taxActiveKey, !isTaxActive)}
                                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                                    isTaxActive ? "bg-amber-600" : "bg-zinc-800"
                                  }`}
                                  aria-label={`Toggle pajak ${wallet.name}`}
                                >
                                  <span
                                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                      isTaxActive ? "translate-x-4.5" : "translate-x-1"
                                    }`}
                                  />
                                </button>
                              </div>

                              {/* Input Nominal Pajak jika Saklar Pajak Aktif */}
                              {isTaxActive ? (
                                <div className="relative flex items-center animate-fade-down">
                                  <span className="absolute left-3 text-[11px] font-bold text-zinc-500 select-none">
                                    Rp
                                  </span>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={6}
                                    placeholder="1000"
                                    value={getNumberValue(wallet.taxKey)}
                                    onChange={(e) => handleNumberChange(wallet.taxKey, e.target.value)}
                                    className="w-full h-8.5 bg-zinc-900 border border-amber-500/30 rounded-xl pl-8 pr-3 text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-amber-500"
                                  />
                                </div>
                              ) : (
                                <div className="h-8.5 px-2.5 rounded-xl bg-emerald-950/25 border border-emerald-500/20 flex items-center justify-between gap-2 text-[11px] text-emerald-400">
                                  <span className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap">
                                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
                                    Bebas Pajak
                                  </span>
                                  <span className="text-[10.5px] font-mono font-bold text-emerald-300/90 whitespace-nowrap">
                                    Rp 0
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="pt-2.5 border-t border-zinc-900 flex items-center justify-center min-h-[62px]">
                              <span className="px-2.5 py-1.5 rounded-lg bg-zinc-900/70 border border-zinc-800/70 text-[10.5px] text-zinc-500 font-medium whitespace-nowrap">
                                Disembunyikan di web user
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: KONTAK */}
            {activeTab === "contacts" && (
              <div className="bg-zinc-900/65 border border-zinc-800/90 rounded-2xl p-5 space-y-5 shadow-sm">
                <div className="pb-3 border-b border-zinc-800/80">
                  <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                      <Share2 className="w-4 h-4" />
                    </span>
                    Tautan Saluran &amp; Kontak Komunitas
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Ubah link saluran WhatsApp resmi dan username Telegram CS tempat pengaduan user dialihkan.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* WhatsApp Channel */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-300">
                        URL Saluran WhatsApp (Channel)
                      </label>
                    </div>
                    <div className="relative">
                      <MessageCircle className="w-4 h-4 text-emerald-400 absolute left-3 top-2.5" />
                      <input
                        type="url"
                        maxLength={300}
                        value={config.whatsapp_channel_url}
                        onChange={(e) => updateField("whatsapp_channel_url", e.target.value.slice(0, 300))}
                        placeholder="https://whatsapp.com/channel/..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Telegram Username */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-300">
                        Username Telegram Admin CS
                      </label>
                    </div>
                    <div className="relative">
                      <span className="text-xs font-bold text-sky-400 absolute left-3.5 top-2.5">@</span>
                      <input
                        type="text"
                        maxLength={300}
                        value={config.telegram_admin_username.replace("@", "")}
                        onChange={(e) =>
                          updateField(
                            "telegram_admin_username",
                            e.target.value.replace("@", "").trim().slice(0, 300)
                          )
                        }
                        placeholder="winterhere"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-8 pr-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <p className="text-[10px] text-zinc-500">
                      Tautan direct CS: https://t.me/{config.telegram_admin_username}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: FITUR */}
            {activeTab === "features" && (
              <div className="bg-zinc-900/65 border border-zinc-800/90 rounded-2xl p-5 space-y-5 shadow-sm">
                <div className="pb-3 border-b border-zinc-800/80">
                  <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400">
                      <ShieldAlert className="w-4 h-4" />
                    </span>
                    Saklar Fitur &amp; Mode Pemeliharaan
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Aktifkan atau matikan fitur tertentu secara instan jika sedang terjadi gangguan server atau antrean penuh.
                  </p>
                </div>

                {/* Saklar Maintenance Global */}
                <div
                  className={`p-4 rounded-2xl border transition-all ${
                    config.is_maintenance_mode
                      ? "bg-rose-950/40 border-rose-500/50 shadow-lg shadow-rose-950/30"
                      : "bg-zinc-950 border-zinc-800"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                        Mode Maintenance Global
                        {config.is_maintenance_mode && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white animate-pulse">
                            AKTIF
                          </span>
                        )}
                      </span>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Jika diaktifkan, seluruh akses web user akan menampilkan banner pemeliharaan.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateField("is_maintenance_mode", !config.is_maintenance_mode)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                        config.is_maintenance_mode ? "bg-rose-600" : "bg-zinc-800"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          config.is_maintenance_mode ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {config.is_maintenance_mode && (
                    <div className="mt-3.5 space-y-1.5 animate-fade-down pt-3 border-t border-rose-500/30">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-rose-300">
                          Pesan Pemeliharaan Untuk Pengguna
                        </label>
                      </div>
                      <textarea
                        rows={2}
                        maxLength={300}
                        value={config.maintenance_message}
                        onChange={(e) => updateField("maintenance_message", e.target.value.slice(0, 300))}
                        className="w-full bg-zinc-900 border border-rose-500/40 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-rose-400"
                      />
                    </div>
                  )}
                </div>

                {/* Saklar Fitur Parsial */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Saklar Fitur Terpisah
                  </h4>

                  {/* Setor Akun */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                    <div>
                      <span className="text-xs font-bold text-white block">Penerimaan Setoran Akun</span>
                      <span className="text-[10px] text-zinc-400">
                        Izinkan user mengirim antrean setoran Gmail ke database.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateField("is_setor_active", !config.is_setor_active)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                        config.is_setor_active ? "bg-emerald-600" : "bg-zinc-800"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          config.is_setor_active ? "translate-x-4.5" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Checker Akun */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                    <div>
                      <span className="text-xs font-bold text-white block">Email Checker Otomatis</span>
                      <span className="text-[10px] text-zinc-400">
                        Izinkan pengecekan status Live / Die pada menu Checker.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateField("is_checker_active", !config.is_checker_active)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                        config.is_checker_active ? "bg-emerald-600" : "bg-zinc-800"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          config.is_checker_active ? "translate-x-4.5" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Penarikan Saldo */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                    <div>
                      <span className="text-xs font-bold text-white block">Penarikan Saldo (Withdrawal)</span>
                      <span className="text-[10px] text-zinc-400">
                        Izinkan user mengajukan pencairan saldo ke e-wallet.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateField("is_withdrawal_active", !config.is_withdrawal_active)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                        config.is_withdrawal_active ? "bg-emerald-600" : "bg-zinc-800"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          config.is_withdrawal_active ? "translate-x-4.5" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

          </form>
          </div>

          {/* Solid Opaque Bottom Action Bar (Reset terpisah di kiri, Simpan Perubahan utama di kanan, z-50 agar tidak tertiban) */}
          <div className="sticky bottom-0 z-50 mt-2 rounded-2xl bg-zinc-950 border border-zinc-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-[0_-10px_30px_rgba(0,0,0,0.75)]">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                type="button"
                variant="ghost"
                onClick={handleReset}
                disabled={saving}
                className="text-xs text-zinc-400 hover:text-white border border-zinc-800 bg-zinc-900/70 px-3 h-9 rounded-xl cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Reset
              </Button>
              <span className="text-[11px] text-zinc-400 truncate hidden sm:inline">
                {updatedAt
                  ? `Disimpan ${new Date(updatedAt).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}`
                  : "Konfigurasi aktif di sistem"}
              </span>
            </div>

            <Button
              type="button"
              onClick={() => handleSave()}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm px-5 h-9.5 rounded-xl shadow-lg shadow-emerald-950/40 cursor-pointer ml-auto"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {saving ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* SISI KANAN: INTERACTIVE LIVE PREVIEW (Scroll Independen)  */}
        {/* ========================================================= */}
        <div className="lg:col-span-6 xl:col-span-6 lg:h-full lg:overflow-y-auto lg:pl-1 space-y-3 min-w-0 pb-6 overflow-x-hidden">
          {/* Preview Control Header */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl px-3.5 py-2.5 backdrop-blur-md shadow-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
              </span>
              <div className="leading-tight">
                <span className="text-xs font-black text-white flex items-center gap-1.5 uppercase tracking-wider">
                  Live Preview Web User
                </span>
                <span className="text-[10px] text-zinc-400">
                  Sinkron real-time: <strong className="text-sky-300">{activeTabLabels[activeTab]}</strong>
                </span>
              </div>
            </div>

            {/* Device Selector */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => setPreviewDevice("desktop")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  previewDevice === "desktop"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                title="Desktop View"
              >
                <Monitor className="size-3.5" />
                <span>Desktop</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewDevice("mobile")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  previewDevice === "mobile"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                title="Mobile Frame View"
              >
                <Smartphone className="size-3.5" />
                <span>Mobile</span>
              </button>
            </div>
          </div>

          {/* ========================================================= */}
          {/* DEVICE SHELL CONTAINER                                    */}
          {/* ========================================================= */}
          <div
            className={`transition-all duration-300 mx-auto ${
              previewDevice === "mobile"
                ? "max-w-[390px] rounded-[38px] border-[6px] border-zinc-800 bg-[#07080d] shadow-2xl p-2 overflow-hidden"
                : "w-full rounded-2xl border border-zinc-800 bg-[#07080d] shadow-2xl overflow-hidden"
            }`}
          >
            {/* Browser / Phone Top Bar */}
            {previewDevice === "desktop" ? (
              <div className="flex items-center justify-between px-3.5 py-2 bg-[#0b0d14] border-b border-white/10 text-zinc-400 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-rose-500/80" />
                  <span className="size-2.5 rounded-full bg-amber-500/80" />
                  <span className="size-2.5 rounded-full bg-emerald-500/80" />
                </div>
                <div className="flex items-center gap-1.5 bg-zinc-900/90 border border-white/10 px-3 py-0.5 rounded-md text-[10px] font-mono text-zinc-300">
                  <Lock className="size-2.5 text-emerald-400" />
                  <span>{activeTabRoutes[activeTab]}</span>
                </div>
                <div className="text-[10px] text-emerald-400 font-semibold">Live</div>
              </div>
            ) : (
              <div className="flex items-center justify-center pb-2 pt-0.5">
                <div className="w-24 h-3.5 bg-zinc-800 rounded-full flex items-center justify-end px-2">
                  <span className="size-1.5 rounded-full bg-zinc-950" />
                </div>
              </div>
            )}

            {/* Viewport Content Area: Identik Web User (#07080d + subtle grid + aurora) */}
            <div
              className="h-[540px] sm:h-[600px] overflow-y-auto overflow-x-hidden bg-[#07080d] text-[#f8fafc] text-xs select-none relative no-scrollbar flex flex-col justify-between"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(255,255,255,0.032) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.032) 1px, transparent 1px)",
                backgroundSize: "42px 42px",
              }}
            >
              {/* Subtle Ambient Aurora */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] h-[55%] rounded-full blur-[80px] opacity-60"
                style={{
                  background:
                    "radial-gradient(circle, rgba(56,189,248,0.16) 0%, rgba(99,102,241,0.10) 45%, transparent 72%)",
                }}
              />

              <div className="relative z-10 flex-1 flex flex-col">
                {/* Global Emergency Maintenance Notification Bar if active and not on features tab */}
                {config.is_maintenance_mode && activeTab !== "features" && (
                  <div className="sticky top-0 z-30 bg-rose-600/95 text-white px-3 py-1.5 text-[10px] font-bold flex items-center justify-between backdrop-blur-md">
                    <span className="flex items-center gap-1">
                      <ShieldAlert className="size-3 shrink-0" />
                      <span>Mode Maintenance Aktif</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab("features")}
                      className="underline text-[10px] cursor-pointer"
                    >
                      Buka Saklar
                    </button>
                  </div>
                )}

                {/* TopBar Asli Web User (Semua tab selain landing) */}
                {activeTab !== "landing" && (
                  <div className="sticky top-0 z-20 border-b border-white/[0.08] bg-[#07080d]/90 backdrop-blur-xl">
                    <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-sky-400/50 to-transparent" />
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <img
                          src="/logo_removebg.png"
                          alt="Logo"
                          className="h-6 w-auto object-contain"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                        <div className="flex items-baseline gap-1 text-[0.82rem] tracking-tight">
                          <span className="font-black text-white">SETOR GMAIL</span>
                          <span className="text-[9px] font-semibold text-zinc-400 lowercase">by</span>
                          <span className="font-black bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-500 bg-clip-text text-transparent">
                            Winter
                          </span>
                        </div>
                      </div>

                      <a
                        href={config.whatsapp_channel_url}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-all ${
                          activeTab === "contacts"
                            ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-500/30"
                            : "border-white/15 bg-white/[0.06] text-zinc-100 hover:border-emerald-400/40"
                        }`}
                      >
                        <span className="relative flex size-3.5 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/15 text-emerald-400">
                          <MessageCircle className="size-2" />
                        </span>
                        <span>Saluran WA</span>
                      </a>
                    </div>
                  </div>
                )}

                {/* =================================================== */}
                {/* 1. VIEW UNTUK TAB: LANDING PAGE (IDENTIK HERO ASLI) */}
                {/* =================================================== */}
                {activeTab === "landing" && (
                  <div className="relative flex-1 flex flex-col justify-between overflow-hidden min-h-[540px]">
                    {/* Diagonal Tilted Marquee persis seperti motion-footer.tsx */}
                    <div className="mt-3 -mx-4 overflow-hidden border-y border-white/10 bg-[#0b0d14]/85 backdrop-blur-md py-2 -rotate-1 shadow-xl">
                      <div className="flex items-center gap-5 whitespace-nowrap px-4 text-[9px] font-extrabold tracking-[0.22em] text-zinc-200 uppercase overflow-hidden">
                        {(config.marquee_text || "PROSES CEPAT • AMAN TERPERCAYA • PENCAIRAN INSTAN • SETOR SEKARANG")
                          .split("•")
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .map((part, i) => (
                            <React.Fragment key={i}>
                              <span>{part}</span>
                              <span className="text-sky-400 font-bold">✦</span>
                            </React.Fragment>
                          ))}
                      </div>
                    </div>

                    {/* Main Hero Grid: 2 Kolom di Desktop, 1 Kolom di Mobile */}
                    <div
                      className={`relative z-10 flex-1 flex items-center px-5 py-6 ${
                        previewDevice === "desktop" ? "px-7" : "px-4"
                      }`}
                    >
                      <div
                        className={`grid w-full items-center gap-6 ${
                          previewDevice === "desktop" ? "grid-cols-12" : "grid-cols-1"
                        }`}
                      >
                        {/* KIRI: Badges, Headline 3 Baris, Subtitle, CTA */}
                        <div
                          className={`flex flex-col ${
                            previewDevice === "desktop"
                              ? "col-span-6 items-start text-left"
                              : "items-center text-center"
                          }`}
                        >
                          {/* Top Micro-Badges: Platform Badge + SSL & Anti-Fraud sejajar */}
                          <div
                            className={`flex flex-wrap items-center gap-1.5 mb-3.5 ${
                              previewDevice === "desktop" ? "justify-start" : "justify-center"
                            }`}
                          >
                            <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-950/60 px-2.5 py-1 shadow-[0_0_16px_-4px_rgba(56,189,248,0.35)]">
                              <span className="size-1.5 rounded-full bg-sky-400" />
                              <span className="text-[9px] font-bold text-sky-200 tracking-wide">
                                {config.platform_badge || "Platform Setor Gmail Terpercaya 2026"}
                              </span>
                            </div>
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-semibold text-zinc-300">
                              <ShieldCheck className="size-3 text-emerald-400" />
                              SSL &amp; Anti-Fraud
                            </span>
                          </div>

                          {/* 3-Line Glowing Headline */}
                          <h2
                            className={`font-black tracking-tight leading-[1.06] mb-3 ${
                              previewDevice === "desktop" ? "text-[2.1rem]" : "text-2xl"
                            }`}
                          >
                            <span className="block text-white">{config.hero_headline_1 || "Ubah Akun"}</span>
                            <span className="block text-white mt-0.5">{config.hero_headline_2 || "Gmail Jadi"}</span>
                            <span className="inline-block mt-0.5 pb-1 bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-500 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(56,189,248,0.5)]">
                              {config.hero_headline_3 || "Penghasilan"}
                            </span>
                          </h2>

                          {/* Subtitle */}
                          <p className="text-[11px] text-zinc-300/90 leading-relaxed whitespace-pre-line mb-4 max-w-xs">
                            {config.hero_subheadline ||
                              "Setor akun Gmail dan dapatkan saldo\nPencairan instan via E-wallet dan Bank"}
                          </p>

                          {/* CTA Buttons persis web user: Daftar Gratis, Masuk, Cara Kerja (non-interaktif di preview) */}
                          <div
                            className={`flex flex-wrap items-center gap-2 ${
                              previewDevice === "desktop" ? "justify-start" : "justify-center"
                            }`}
                          >
                            <span
                              title="Preview saja"
                              aria-disabled="true"
                              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-sky-400 via-sky-500 to-blue-600 px-4 py-2 text-[11px] font-extrabold text-white shadow-lg shadow-sky-500/35 cursor-default opacity-95"
                            >
                              <UserPlus className="size-3.5" />
                              <span>Daftar Gratis</span>
                              <ArrowRight className="size-3" />
                            </span>
                            <span
                              title="Preview saja"
                              aria-disabled="true"
                              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-2 text-[11px] font-bold text-white cursor-default"
                            >
                              <LogIn className="size-3.5 text-sky-400" />
                              <span>Masuk</span>
                            </span>
                            <span
                              title="Preview saja"
                              aria-disabled="true"
                              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-semibold text-zinc-300 cursor-default"
                            >
                              <PlayCircle className="size-3.5 text-sky-400" />
                              <span>Cara Kerja</span>
                            </span>
                          </div>
                        </div>

                        {/* KANAN: Showcase Card + 4 Floating Orbit Cards persis web user */}
                        <div className={previewDevice === "desktop" ? "col-span-6" : ""}>
                          <div className="relative mx-auto max-w-[260px] py-5">
                            {/* Center Card */}
                            <div className="rounded-2xl border border-white/12 bg-gradient-to-b from-[#161821]/95 to-[#0d0e14]/95 px-4 py-7 flex flex-col items-center text-center shadow-2xl relative z-10">
                              <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 via-sky-400 to-blue-600 shadow-lg shadow-sky-500/30 p-1.5 mb-2.5">
                                <img
                                  src="/envelope-icon.png"
                                  alt="Logo Setor Gmail"
                                  className="size-full object-contain"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = "none";
                                  }}
                                />
                              </div>

                              <h3 className="text-sm font-black text-white tracking-tight">Setor Gmail</h3>
                              <p className="mt-1 text-[9.5px] text-zinc-400 flex flex-wrap items-center justify-center gap-1">
                                <span>Generate nama</span>
                                <span className="text-sky-400 font-bold">✦</span>
                                <span>Buat akun</span>
                                <span className="text-sky-400 font-bold">✦</span>
                                <span>Langsung cair</span>
                              </p>

                              {config.badge_status_active && (
                                <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-full border border-amber-400/35 bg-gradient-to-r from-amber-950/80 via-amber-900/50 to-amber-950/80 px-2.5 py-1 text-[9px] font-bold text-amber-300 shadow-[0_0_16px_-4px_rgba(245,158,11,0.35)]">
                                  <span className="size-1.5 rounded-full bg-amber-400 shrink-0" />
                                  <Wrench className="size-2.5 text-amber-300 shrink-0" />
                                  <span className="truncate max-w-[175px]">
                                    {config.badge_status_text || "Platform sedang dalam tahap pengembangan"}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* 4 Orbit Cards */}
                            <div className="absolute top-0 -left-3 z-20 rounded-xl border border-white/12 bg-[#141620]/95 px-2 py-1.5 flex items-center gap-1.5 shadow-xl">
                              <span className="flex size-6 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/25">
                                <Zap className="size-3 fill-amber-400" />
                              </span>
                              <div className="leading-tight">
                                <div className="text-[9px] font-extrabold text-white">Cair Instan</div>
                                <div className="text-[7.5px] text-zinc-400">E-Wallet &amp; Bank</div>
                              </div>
                            </div>

                            <div className="absolute top-0 -right-3 z-20 rounded-xl border border-white/12 bg-[#141620]/95 px-2 py-1.5 flex items-center gap-1.5 shadow-xl">
                              <span className="flex size-6 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                <Banknote className="size-3" />
                              </span>
                              <div className="leading-tight">
                                <div className="text-[9px] font-extrabold text-white">Rp 90.000 Cair</div>
                                <div className="text-[7.5px] text-emerald-400">DANA · 2m lalu</div>
                              </div>
                            </div>

                            <div className="absolute bottom-0 -left-3 z-20 rounded-xl border border-white/12 bg-[#141620]/95 px-2 py-1.5 flex items-center gap-1.5 shadow-xl">
                              <span className="flex size-6 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400 border border-sky-500/25">
                                <ShieldCheck className="size-3" />
                              </span>
                              <div className="leading-tight">
                                <div className="text-[9px] font-extrabold text-white">100% Aman</div>
                                <div className="text-[7.5px] text-zinc-400">SSL Terenkripsi</div>
                              </div>
                            </div>

                            <div className="absolute bottom-0 -right-3 z-20 rounded-xl border border-white/12 bg-[#141620]/95 px-2 py-1.5 flex items-center gap-1.5 shadow-xl">
                              <span className="flex size-6 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400 border border-sky-500/25">
                                <Users className="size-3" />
                              </span>
                              <div className="leading-tight">
                                <div className="text-[9px] font-extrabold text-white">3.5K+ Member</div>
                                <div className="text-[7.5px] text-sky-400">Aktif menyetor</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Watermark + Cloudflare + Crafted by Winter */}
                    <div className="relative px-4 pb-3 pt-1 flex items-end justify-between gap-2">
                      <span className="text-2xl sm:text-3xl font-black tracking-tighter text-white/[0.06] select-none leading-none">
                        SETOR GMAIL
                      </span>
                      <div className="flex items-center gap-1.5">
                        <div className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 flex items-center gap-1.5">
                          <svg
                            className="size-3 shrink-0"
                            viewBox="0 0 64 32"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M44.3 25.4H14.5c-4.3 0-7.8-3.4-7.8-7.7 0-3.8 2.8-7 6.5-7.6C14.7 5.7 19 2.6 24 2.6c5.8 0 10.6 4.4 11.2 10 .9-.4 1.9-.6 3-.6 3.7 0 6.7 2.8 7 6.4 3 .5 5.3 3.1 5.3 6.2 0 .3 0 .5-.1.8H44.3z"
                              fill="#F38020"
                            />
                            <path
                              d="M47.4 18.6c-.4 0-.9.1-1.3.2-.5-3.3-3.4-5.8-6.8-5.8-1 0-2 .2-2.8.6-.4.2-.7.6-.6 1.1l.4 2.6c.1.7.7 1.2 1.4 1.2h10.8c2.2 0 4 1.7 4.2 3.9h3.9c.1-.3.1-.6.1-.9 0-3.5-2.8-6.3-6.3-6.3-1.1 0-2.1.3-3 .8v2.6z"
                              fill="#FAAE40"
                            />
                          </svg>
                          <span className="text-[9px] font-bold text-zinc-200">Cloudflare</span>
                        </div>
                        <div className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 flex items-center gap-1">
                          <span className="text-[8px] font-semibold uppercase tracking-wider text-zinc-400">
                            Crafted by
                          </span>
                          <span className="text-[9px] font-black bg-gradient-to-r from-sky-300 to-blue-400 bg-clip-text text-transparent">
                            Winter
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* =================================================== */}
                {/* 2. VIEW UNTUK TAB: RULES (IDENTIK /SETOR COMPACT)   */}
                {/* =================================================== */}
                {activeTab === "rules" && (
                  <div className="p-4 space-y-3.5">
                    <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-gradient-to-b from-[#151824]/92 via-[#11131c]/95 to-[#0c0d14]/95 p-4 shadow-2xl space-y-3.5">
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-sky-400/50 to-transparent" />

                      {/* Segmented Switch: Pilih Jenis Gmail */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="flex size-5.5 items-center justify-center rounded-md bg-sky-500/15 text-sky-400 border border-sky-400/25">
                            <Mail className="size-3" />
                          </span>
                          <h4 className="text-xs font-extrabold text-white">Pilih Jenis Gmail</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-white/10 bg-black/50 p-1">
                          <button
                            type="button"
                            onClick={() => setPreviewDepositMode("fresh")}
                            className={`flex items-center justify-between gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-extrabold transition-all cursor-pointer ${
                              previewDepositMode === "fresh"
                                ? "bg-sky-500/15 border border-sky-400/45 text-white"
                                : "border border-transparent text-zinc-400"
                            }`}
                          >
                            <span className="inline-flex items-center gap-1 truncate">
                              <Sparkles className="size-3 text-sky-400 shrink-0" />
                              <span className="truncate">Buat Email Baru</span>
                            </span>
                            <span className="rounded-full bg-emerald-500/15 border border-emerald-400/35 px-1.5 py-0.5 text-[9px] text-emerald-300 font-mono shrink-0">
                              Rp{config.price_per_gmail.toLocaleString("id-ID")}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPreviewDepositMode("old")}
                            className={`flex items-center justify-between gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-extrabold transition-all cursor-pointer ${
                              previewDepositMode === "old"
                                ? "bg-sky-500/15 border border-sky-400/45 text-white"
                                : "border border-transparent text-zinc-400"
                            }`}
                          >
                            <span className="inline-flex items-center gap-1 truncate">
                              <Send className="size-3 text-sky-400 shrink-0" />
                              <span className="truncate">Setor Email Lama</span>
                            </span>
                            <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] text-zinc-300 font-mono shrink-0">
                              Rp{config.price_bebas.toLocaleString("id-ID")}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Rules Setoran Gmail Compact (detail masuk ke kotak masing-masing) */}
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="flex size-5.5 items-center justify-center rounded-md bg-sky-500/15 text-sky-400 border border-sky-400/25">
                              <ScrollText className="size-3" />
                            </span>
                            <h4 className="text-xs font-extrabold text-white">Rules Setoran Gmail</h4>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPreviewShowRulesDetail(!previewShowRulesDetail)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-400 hover:text-sky-300 cursor-pointer"
                          >
                            <span>{previewShowRulesDetail ? "Tutup Detail" : "Detail Aturan"}</span>
                            {previewShowRulesDetail ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                          </button>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                          {[
                            {
                              icon: Sparkles,
                              color: "text-emerald-400",
                              title: previewDepositMode === "fresh" ? config.rule_status : "Email Lama (sudah terdaftar)",
                              detail: config.rules_detail_text[0],
                            },
                            {
                              icon: CheckCircle2,
                              color: "text-sky-400",
                              title: previewDepositMode === "fresh" ? config.rule_nama : "Bebas (tidak perlu generate)",
                              detail: config.rules_detail_text[1],
                            },
                            {
                              icon: Calendar,
                              color: "text-amber-400",
                              title: config.rule_usia,
                              detail: config.rules_detail_text[2],
                            },
                            {
                              icon: ShieldAlert,
                              color: "text-rose-400",
                              title: config.rule_keamanan,
                              detail: config.rules_detail_text[3],
                            },
                          ].map((r, i) => {
                            const IconComp = r.icon;
                            return (
                              <div key={i} className="rounded-xl border border-white/10 bg-black/40 px-2 py-1.5">
                                <div className="flex items-center gap-1.5">
                                  <IconComp className={`size-3 shrink-0 ${r.color}`} />
                                  <span className="text-[10px] font-semibold text-zinc-200 truncate">{r.title}</span>
                                </div>
                                {previewShowRulesDetail && r.detail && (
                                  <p className="mt-1 pl-4.5 text-[9px] leading-snug text-zinc-400">{r.detail}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Generate Gmail Compact (Mode Buat Email Baru) / Password & Caution (Email Lama) */}
                      {previewDepositMode === "fresh" ? (
                        <div className="pt-2.5 border-t border-white/10 space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <Sparkles className="size-3.5 text-sky-400" />
                              <span className="text-xs font-extrabold text-white">Generate Gmail</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1 text-[9px] text-zinc-300">
                              {["1 Generate", "2 Salin", "3 Bikin Akun", "4 Setor"].map((st, i) => (
                                <React.Fragment key={st}>
                                  <span className="rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 font-semibold">
                                    {st}
                                  </span>
                                  {i < 3 && <span className="text-zinc-600">→</span>}
                                </React.Fragment>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-xl border border-white/10 bg-black/40 p-2.5 space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] font-bold text-zinc-400 uppercase mr-0.5">Jumlah:</span>
                                {[1, 3, 5, 10].map((num) => (
                                  <button
                                    key={num}
                                    type="button"
                                    onClick={() => setPreviewSelectedCount(num)}
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer ${
                                      previewSelectedCount === num
                                        ? "bg-sky-500 text-white"
                                        : "bg-white/5 text-zinc-300 border border-white/10"
                                    }`}
                                  >
                                    {num}
                                  </button>
                                ))}
                              </div>

                              <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-2 py-1">
                                <span className="text-[9px] font-semibold text-emerald-300">Pass:</span>
                                <span className="font-mono text-[10px] font-black text-white">
                                  {config.default_password}
                                </span>
                                <button
                                  type="button"
                                  onClick={handleCopyPreviewPassword}
                                  className="inline-flex items-center gap-0.5 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-200 cursor-pointer"
                                >
                                  {previewCopiedPassword ? <Check className="size-2.5" /> : <Copy className="size-2.5" />}
                                  <span>{previewCopiedPassword ? "OK" : "Copy"}</span>
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-[10px]">
                              <span className="text-zinc-400">Estimasi ({previewSelectedCount} akun):</span>
                              <span className="font-mono font-black text-emerald-400">
                                Rp{(previewSelectedCount * config.price_per_gmail).toLocaleString("id-ID")}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="pt-2.5 border-t border-white/10 space-y-2">
                          <div className="text-[10px] font-bold text-zinc-200 flex items-center justify-between">
                            <span>Kolom Checker &amp; Setoran (Email | Password)</span>
                            <span className="text-[9px] text-sky-400 font-mono">Wajib sertakan password</span>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-black/45 px-3 py-2 font-mono text-[10px] text-zinc-300 space-y-1">
                            <div>winterhere777@gmail.com | {config.default_password}</div>
                            <div className="text-zinc-500">contohkedua88@gmail.com | sandiemail2</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* =================================================== */}
                {/* 3. VIEW UNTUK TAB: HARGA & SALDO (IDENTIK DASHBOARD)*/}
                {/* =================================================== */}
                {activeTab === "pricing" && (
                  <div className="p-4 space-y-3.5">
                    {/* Balance Card Persis dashboard-view.tsx */}
                    <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-gradient-to-b from-[#151824]/92 via-[#11131c]/95 to-[#0c0d14]/95 p-4 shadow-2xl space-y-4">
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-sky-400/50 to-transparent" />
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[9px] font-bold tracking-widest text-zinc-400 uppercase">
                            Saldo Dompet Kamu
                          </p>
                          <p className="mt-1 text-2xl font-black tracking-tight text-white tabular-nums">
                            Rp50.000
                          </p>
                        </div>
                        <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 via-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/35">
                          <Wallet className="size-4.5" />
                        </span>
                      </div>

                      {/* Inline Stats Persis Dashboard (Harga & Min. Penarikan — batas harian disembunyikan dari user) */}
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                        <div>
                          <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-sky-300/85">
                            <Zap className="size-3 text-sky-400" />
                            <span>Harga / Gmail</span>
                          </div>
                          <p className="mt-0.5 text-xs sm:text-sm font-black text-white tabular-nums">
                            Rp{config.price_per_gmail.toLocaleString("id-ID")}
                          </p>
                        </div>
                        <div className="h-6 w-[1px] bg-white/10" aria-hidden="true" />
                        <div>
                          <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                            <Target className="size-3 text-sky-400" />
                            <span>Min. Penarikan</span>
                          </div>
                          <p className="mt-0.5 text-xs sm:text-sm font-black text-white tabular-nums">
                            Rp{config.min_withdrawal.toLocaleString("id-ID")}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <span className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-sky-400 via-sky-500 to-blue-600 text-xs font-bold text-white shadow-md shadow-sky-500/30">
                          <Wallet className="size-3.5" />
                          Tarik Saldo
                        </span>
                        <span className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] text-xs font-bold text-zinc-200">
                          <History className="size-3.5 text-sky-400" />
                          Riwayat
                        </span>
                      </div>
                    </div>

                    {/* Preview Pilihan E-Wallet & Pajak Penarikan */}
                    <div className="rounded-2xl border border-white/10 bg-[#11131c]/90 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold text-white">Simulasi Tarik Rp20.000</span>
                        {activeEwallets.length > 0 ? (
                          <span className={previewTax > 0 ? "text-amber-400 font-bold" : "text-emerald-400 font-bold"}>
                            {previewTax > 0
                              ? `Pajak Rp${previewTax.toLocaleString("id-ID")}`
                              : "Bebas Pajak"}
                          </span>
                        ) : (
                          <span className="text-rose-400 font-bold">Semua Nonaktif</span>
                        )}
                      </div>

                      {activeEwallets.length === 0 ? (
                        <div className="p-2.5 rounded-xl bg-black/40 border border-rose-500/30 text-rose-300 text-center text-[10px] font-semibold">
                          Semua metode e-wallet sedang dinonaktifkan.
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-1.5">
                          {activeEwallets.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setPreviewWithdrawMethod(item.id)}
                              className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                                previewWithdrawMethod === item.id
                                  ? "border-sky-500 bg-sky-500/20 text-white font-bold"
                                  : "border-white/10 bg-black/35 text-zinc-400 hover:text-white"
                              }`}
                            >
                              <div className="flex items-center justify-between text-[11px]">
                                <span>{item.label}</span>
                                {previewWithdrawMethod === item.id && (
                                  <CheckCircle2 className="size-3 text-sky-400" />
                                )}
                              </div>
                              <span
                                className={`text-[8.5px] font-mono block mt-0.5 ${
                                  item.tax === 0 ? "text-emerald-400" : "text-amber-300"
                                }`}
                              >
                                {item.tax === 0 ? "Bebas Pajak" : `Pajak: Rp${item.tax.toLocaleString("id-ID")}`}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="p-2 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between text-[11px]">
                        <span className="text-zinc-400">Diterima Bersih:</span>
                        <span className="font-mono font-black text-emerald-400">
                          Rp{(20000 - previewTax).toLocaleString("id-ID")}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* =================================================== */}
                {/* 4. VIEW UNTUK TAB: KONTAK (IDENTIK /LAPORAN ASLI)   */}
                {/* =================================================== */}
                {activeTab === "contacts" && (
                  <div className="p-4 flex flex-col items-center justify-center flex-1">
                    <div className="w-full max-w-[420px] flex flex-col items-center">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-[9px] font-extrabold uppercase tracking-wider text-sky-300 mb-3.5">
                        <Sparkles className="size-3 text-sky-400" />
                        Layanan Bantuan Resmi
                      </span>

                      <div className="grid grid-cols-2 gap-3 w-full">
                        <div className="flex flex-col items-center gap-2">
                          <div className="relative w-full aspect-[876/1024] overflow-hidden rounded-2xl drop-shadow-[0_14px_30px_rgba(56,189,248,0.18)]">
                            <img
                              src="/qr-telegram.jpg"
                              alt={`Telegram QR @${config.telegram_admin_username.replace("@", "")}`}
                              className="size-full object-cover"
                            />
                          </div>
                          <a
                            href={`https://t.me/${config.telegram_admin_username.replace("@", "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0284c7] to-[#38bdf8] px-3 py-2 text-[10px] font-extrabold text-white shadow-md"
                          >
                            <Send className="size-3 shrink-0" />
                            <span className="truncate">Telegram (@{config.telegram_admin_username.replace("@", "")})</span>
                          </a>
                        </div>

                        <div className="flex flex-col items-center gap-2">
                          <div className="relative w-full aspect-[877/1024] overflow-hidden rounded-2xl drop-shadow-[0_14px_30px_rgba(34,197,94,0.18)]">
                            <img
                              src="/qr-whatsapp.png"
                              alt="WhatsApp QR Resmi"
                              className="size-full object-cover"
                            />
                          </div>
                          <a
                            href="https://chat.whatsapp.com/Kbey1hvCUO7JzH2FBEZsAy?s=cl&p=i&iam=2"
                            target="_blank"
                            rel="noreferrer"
                            className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#16a34a] to-[#22c55e] px-3 py-2 text-[10px] font-extrabold text-white shadow-md"
                          >
                            <MessageCircle className="size-3 shrink-0" />
                            <span className="truncate">WhatsApp Resmi</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* =================================================== */}
                {/* 5. VIEW UNTUK TAB: FITUR & SAKLAR                   */}
                {/* =================================================== */}
                {activeTab === "features" && (
                  <div className="p-4 space-y-3.5">
                    {config.is_maintenance_mode ? (
                      <div className="p-5 flex flex-col items-center justify-center text-center space-y-3 rounded-2xl border border-rose-500/30 bg-rose-950/30">
                        <div className="flex size-12 items-center justify-center rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400">
                          <ShieldAlert className="size-6" />
                        </div>
                        <div className="space-y-1">
                          <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[9px] font-bold uppercase tracking-wider">
                            Mode Pemeliharaan Aktif
                          </span>
                          <h3 className="text-sm font-black text-white">
                            Sistem Sedang Dalam Pemeliharaan
                          </h3>
                        </div>
                        <div className="p-3 rounded-xl bg-black/60 border border-rose-500/30 text-[11px] text-zinc-300 max-w-xs leading-relaxed">
                          {config.maintenance_message}
                        </div>
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-sky-400 font-semibold">
                          <Send className="size-3" />
                          <span>Hubungi CS Telegram: @{config.telegram_admin_username.replace("@", "")}</span>
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="size-5 text-emerald-400" />
                            <div>
                              <span className="text-xs font-bold text-white block">Sistem Beroperasi Penuh</span>
                              <span className="text-[10px] text-zinc-400">Mode maintenance sedang nonaktif.</span>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                            Normal
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-[11px]">
                          <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
                            <span className="text-zinc-400 block text-[9px] uppercase font-bold">Setor Akun</span>
                            <span className={`font-bold block ${config.is_setor_active ? "text-emerald-400" : "text-rose-400"}`}>
                              {config.is_setor_active ? "Buka" : "Tutup"}
                            </span>
                          </div>
                          <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
                            <span className="text-zinc-400 block text-[9px] uppercase font-bold">Checker</span>
                            <span className={`font-bold block ${config.is_checker_active ? "text-emerald-400" : "text-rose-400"}`}>
                              {config.is_checker_active ? "Aktif" : "Nonaktif"}
                            </span>
                          </div>
                          <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
                            <span className="text-zinc-400 block text-[9px] uppercase font-bold">Tarik Saldo</span>
                            <span className={`font-bold block ${config.is_withdrawal_active ? "text-emerald-400" : "text-rose-400"}`}>
                              {config.is_withdrawal_active ? "Buka" : "Tutup"}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => updateField("is_maintenance_mode", true)}
                          className="w-full py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold transition-colors cursor-pointer"
                        >
                          Simulasikan Mode Maintenance
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Floating BottomNav Asli Web User (Semua tab selain landing) */}
              {activeTab !== "landing" && (
                <div className="sticky bottom-2 z-20 px-4 pb-2 pt-1">
                  <div className="mx-auto max-w-[300px] flex items-center justify-around gap-1 rounded-full border border-white/12 bg-[#11131c]/95 px-2 py-1.5 shadow-2xl backdrop-blur-xl">
                    <div
                      className={`flex flex-col items-center px-2.5 py-0.5 rounded-full text-[8.5px] font-semibold ${
                        activeTab === "pricing" ? "text-sky-400 bg-sky-400/10 font-bold" : "text-zinc-400"
                      }`}
                    >
                      <Home className="size-3.5 mb-0.5" />
                      <span>Beranda</span>
                    </div>
                    <div className="flex flex-col items-center px-2 py-0.5 text-[8.5px] font-semibold text-zinc-400">
                      <History className="size-3.5 mb-0.5" />
                      <span>Riwayat</span>
                    </div>
                    <div
                      className={`-mt-4 flex items-center justify-center size-9 rounded-full bg-gradient-to-tr from-sky-400 via-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/40 ${
                        activeTab === "rules" ? "ring-2 ring-sky-300 scale-105" : ""
                      }`}
                    >
                      <Send className="size-3.5" />
                    </div>
                    <div className="flex flex-col items-center px-2 py-0.5 text-[8.5px] font-semibold text-zinc-400">
                      <ShieldCheck className="size-3.5 mb-0.5" />
                      <span>Checker</span>
                    </div>
                    <div
                      className={`flex flex-col items-center px-2.5 py-0.5 rounded-full text-[8.5px] font-semibold ${
                        activeTab === "contacts" ? "text-sky-400 bg-sky-400/10 font-bold" : "text-zinc-400"
                      }`}
                    >
                      <User className="size-3.5 mb-0.5" />
                      <span>Profil</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Home Bar */}
            {previewDevice === "mobile" && (
              <div className="pt-2 pb-0.5 flex justify-center">
                <div className="w-24 h-1 bg-zinc-700 rounded-full" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
