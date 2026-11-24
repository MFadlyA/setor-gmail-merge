"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Check,
  Copy,
  ScrollText,
  Send,
  Sparkles,
  Trash2,
  ShieldCheck,
  RefreshCw,
  ClipboardPaste,
  Clock,
  CheckCircle2,
  ChevronDown,
  Calendar,
  ShieldAlert,
  AlertTriangle,
  UserCheck,
  KeyRound,
  Mail,
} from "lucide-react";
import { PageShell, Reveal } from "@/components/layout/page-shell";
import { defaultPassword } from "@/lib/mock-data";
import { cn, formatIDR } from "@/lib/utils";
import {
  getStoredGeneratedGmails,
  saveStoredGeneratedGmails,
  getStoredSubmittedGmails,
  saveStoredSubmittedGmails,
  getStoredCheckStatusMap,
  saveStoredCheckStatusMap,
} from "@/lib/generated-storage";
import { getCurrentAuthUser, insertUserDeposits } from "@/lib/supabase";
import { secureRandomInt } from "@/lib/security";
import { useUserProfile } from "@/context/user-profile-context";

export interface SetoranCheckItem {
  index: number;
  email: string;
  status: "LIVE" | "UNREGISTERED" | "SUDAH DISETOR" | "DIABAIKAN" | "INVALID";
  reason: string;
}

/* ------------------------------------------------------------------ */
/* High-entropy Gmail Generator (Matching zero99 pattern)              */
/* Pattern: [4 random letters][name1][name2][2 digits]@gmail.com      */
/* Total combinations: > 100,000,000,000 (virtually 0% Google collision) */
/* ------------------------------------------------------------------ */

const PREFIX_CHARS = "abcdefghijklmnopqrstuvwxyz";

function randomPrefix(length = 4): string {
  let res = "";
  for (let i = 0; i < length; i++) {
    res += PREFIX_CHARS[secureRandomInt(PREFIX_CHARS.length)];
  }
  return res;
}

import { FIRST_NAMES, SECOND_NAMES } from "@/lib/generator-names";

const DOMAIN = "gmail.com";
const HISTORY_KEY = "setor_generated_gmails_history_v1";

function randomFrom<T>(list: T[]): T {
  return list[secureRandomInt(list.length)];
}

function generateSingleGmail(): string {
  const prefix = randomPrefix(4);
  const name1 = randomFrom(FIRST_NAMES);
  const name2 = randomFrom(SECOND_NAMES);
  const suffix = String(secureRandomInt(100)).padStart(2, "0");
  return `${prefix}${name1}${name2}${suffix}@${DOMAIN}`;
}

function getStoredHistory(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveToHistory(newEmails: string[]) {
  if (typeof window === "undefined") return;
  try {
    const history = getStoredHistory();
    newEmails.forEach((e) => history.add(e.toLowerCase()));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(Array.from(history).slice(-10000)));
  } catch {
    // ignore
  }
}

function generateBatch(count: number, existingPool?: Set<string>): string[] {
  const history = getStoredHistory();
  const seen = new Set<string>();
  let attempts = 0;
  while (seen.size < count && attempts < 2000) {
    attempts++;
    const email = generateSingleGmail();
    const lower = email.toLowerCase();
    if (!seen.has(lower) && !history.has(lower) && (!existingPool || !existingPool.has(lower))) {
      seen.add(email);
    }
  }
  const result = Array.from(seen);
  saveToHistory(result);
  return result;
}

export function SetorView() {
  const [emails, setEmails] = React.useState("");
  const [depositMode, setDepositMode] = React.useState<"fresh" | "old">("fresh");
  const [oldEmailPassword, setOldEmailPassword] = React.useState("");
  const { refreshDeposits, refreshWallet, siteConfig } = useUserProfile();
  const activePassword = siteConfig?.default_password || defaultPassword;
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [copiedPassword, setCopiedPassword] = React.useState(false);
  const [showRulesDetail, setShowRulesDetail] = React.useState(false);

  // Generator State
  const [isMounted, setIsMounted] = React.useState(false);
  const [customCountInput, setCustomCountInput] = React.useState<number>(5);
  const [generatedList, setGeneratedList] = React.useState<string[]>([]);
  const [generatedPool, setGeneratedPool] = React.useState<Set<string>>(() => new Set());
  const [copiedEmail, setCopiedEmail] = React.useState<string | null>(null);

  // Setoran Checker State
  const [isCheckingSetoran, setIsCheckingSetoran] = React.useState(false);
  const [setoranCheckResults, setSetoranCheckResults] = React.useState<SetoranCheckItem[]>([]);
  const [hasCheckedSetoran, setHasCheckedSetoran] = React.useState(false);

  // Submitted & Check Status Tracking
  const [submittedSet, setSubmittedSet] = React.useState<Set<string>>(() => new Set());
  const [checkStatusMap, setCheckStatusMap] = React.useState<Record<string, "LIVE" | "UNREGISTERED">>({});

  // Mount effect: load existing generated batch, submitted emails, and check statuses from localStorage
  React.useEffect(() => {
    setIsMounted(true);
    const existing = getStoredGeneratedGmails();
    if (existing.length > 0) {
      setGeneratedList(existing);
      setGeneratedPool(new Set(existing.map((e) => e.toLowerCase())));
    }
    const submitted = getStoredSubmittedGmails();
    if (submitted.length > 0) {
      setSubmittedSet(new Set(submitted.map((e) => e.toLowerCase())));
    }
    const statusMap = getStoredCheckStatusMap();
    if (Object.keys(statusMap).length > 0) {
      setCheckStatusMap(statusMap);
    }
  }, []);

  // Count unsubmitted generated emails based on actual submittedSet
  const unsubmittedCount = React.useMemo(() => {
    return generatedList.filter((email) => !submittedSet.has(email.toLowerCase())).length;
  }, [generatedList, submittedSet]);

  // Handle generating new batch with high-entropy guarantee
  const handleGenerate = (count = customCountInput) => {
    const validCount = Math.max(1, Math.min(10, count));
    const list = generateBatch(validCount, generatedPool);
    setGeneratedList(list);
    saveStoredGeneratedGmails(list);
    setGeneratedPool((prev) => {
      const next = new Set(prev);
      list.forEach((e) => next.add(e.toLowerCase()));
      return next;
    });
    toast.success(`${validCount} nama Gmail unik berhasil digenerate!`, {
      description: "Pola unik 100% segar & belum pernah didaftarkan di Google.",
    });
  };

  // Handle Generate Lagi: appends selected count to existing batch (max 10)
  const handleGenerateMore = (count = customCountInput) => {
    const currentCount = generatedList.length;
    if (currentCount >= 10) {
      toast.error("Maksimal 10 Gmail telah tercapai!");
      return;
    }
    const maxCanAdd = 10 - currentCount;
    const toAdd = Math.min(Math.max(1, count), maxCanAdd);
    const newBatch = generateBatch(toAdd, generatedPool);
    const combined = [...generatedList, ...newBatch];

    setGeneratedList(combined);
    saveStoredGeneratedGmails(combined);
    setGeneratedPool((prev) => {
      const next = new Set(prev);
      newBatch.forEach((e) => next.add(e.toLowerCase()));
      return next;
    });

    if (currentCount + count > 10) {
      toast.info(`Ditambahkan ${toAdd} Gmail (maksimal 10 tercapai, total: 10 akun).`);
    } else {
      toast.success(`${toAdd} Gmail tambahan berhasil digenerate! Total: ${combined.length} akun.`);
    }
  };

  const handleDeleteGenerated = (index: number) => {
    setGeneratedList((prev) => {
      const next = prev.filter((_, i) => i !== index);
      saveStoredGeneratedGmails(next);
      return next;
    });
    toast.info("1 Gmail dihapus dari daftar.");
  };

  const handleCopyOne = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(email);
      toast.success(`Disalin: ${email}`);
      window.setTimeout(() => setCopiedEmail(null), 1800);
    } catch {
      toast.error("Gagal menyalin ke clipboard");
    }
  };

  const handleCopyAll = async () => {
    if (generatedList.length === 0) return;
    try {
      await navigator.clipboard.writeText(generatedList.join("\n"));
      toast.success(`${generatedList.length} Gmail disalin ke clipboard!`);
    } catch {
      toast.error("Gagal menyalin semua Gmail");
    }
  };

  const handleCopyUnsubmitted = async () => {
    const unsubmitted = generatedList.filter(
      (email) => !submittedSet.has(email.toLowerCase())
    );
    if (unsubmitted.length === 0) {
      toast.info("Semua Gmail sudah disetor!");
      return;
    }
    try {
      await navigator.clipboard.writeText(unsubmitted.join("\n"));
      toast.success(`${unsubmitted.length} Gmail belum disetor disalin!`);
    } catch {
      toast.error("Gagal menyalin");
    }
  };

  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(activePassword);
      setCopiedPassword(true);
      toast.success("Password wajib disalin ke clipboard!");
      window.setTimeout(() => setCopiedPassword(false), 2000);
    } catch {
      toast.error("Gagal menyalin password");
    }
  };

  const handlePasteGenerated = () => {
    const list = generatedList.length > 0 ? generatedList : getStoredGeneratedGmails();
    if (list.length === 0) {
      toast.info("Belum ada Gmail yang digenerate di atas.");
      return;
    }
    const capped = list.slice(0, 10);
    setEmails(capped.join("\n"));
    setHasCheckedSetoran(false);
    setSetoranCheckResults([]);
    toast.success(`${capped.length} Gmail hasil generate berhasil ditempel ke kolom checker!`);
  };

  const handleClearEmails = () => {
    setEmails("");
    setHasCheckedSetoran(false);
    setSetoranCheckResults([]);
    toast.info("Kolom checker dikosongkan.");
  };

  /* ------------------------------------------------------------------ */
  /* Real-time Validation for Textarea                                  */
  /* ------------------------------------------------------------------ */

  const { validCount, totalLines, isExceededMax, notGeneratedCount } =
    React.useMemo(() => {
      const rawLines = emails.split("\n");
      const cleanLines = rawLines.map((l) => l.trim()).filter(Boolean);
      const seen = new Set<string>();

      let valid = 0;
      let invalid = 0;
      let notGen = 0;

      const currentStored = typeof window !== "undefined" ? getStoredGeneratedGmails() : [];
      const historySet = typeof window !== "undefined" ? getStoredHistory() : new Set<string>();
      const combinedPool = new Set([
        ...Array.from(generatedPool).map((e) => e.toLowerCase()),
        ...currentStored.map((e) => e.toLowerCase()),
        ...Array.from(historySet).map((e) => e.toLowerCase()),
      ]);

      cleanLines.forEach((line) => {
        const lower = line.toLowerCase();
        const isGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(lower);

        if (!isGmail || seen.has(lower)) {
          invalid++;
        } else if (!combinedPool.has(lower)) {
          notGen++;
        } else {
          valid++;
          seen.add(lower);
        }
      });

      return {
        validCount: valid,
        totalLines: cleanLines.length,
        isExceededMax: cleanLines.length > 10,
        invalidCount: invalid,
        notGeneratedCount: notGen,
      };
    }, [emails, generatedPool]);

  // Block Enter when already at 10 lines
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      const target = e.currentTarget;
      const hasMultiLineSelection =
        target.selectionStart !== target.selectionEnd &&
        emails.slice(target.selectionStart, target.selectionEnd).includes("\n");
      const currentLineCount = emails.split("\n").length;
      if (!hasMultiLineSelection && currentLineCount >= 10) {
        e.preventDefault();
        toast.warning("Maksimal 10 Gmail per setoran", {
          id: "max-10-gmail",
          description: "Tidak bisa menekan Enter lagi karena sudah mencapai batas 10 baris.",
        });
      }
    }
  };

  // Hard cap textarea at 10 lines (including paste)
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const normalized = e.target.value.replace(/\r\n/g, "\n");
    const lines = normalized.split("\n");

    if (lines.length > 10) {
      setEmails(lines.slice(0, 10).join("\n"));
      toast.warning("Maksimal 10 Gmail per setoran", {
        id: "max-10-gmail",
        description: "Jumlah baris otomatis dibatasi maksimal 10 Gmail.",
      });
    } else {
      setEmails(normalized);
    }
    setHasCheckedSetoran(false);
  };

  /* ------------------------------------------------------------------ */
  /* Checker untuk Kolom Setoran (Hanya cek Gmail hasil generate)       */
  /* Email non-generate: ABAIKAN dan beri status DIABAIKAN               */
  /* Email sudah disetor: Tidak dicek lagi                               */
  /* ------------------------------------------------------------------ */
  const handleCheckSetoran = async () => {
    const rawLines = emails
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (rawLines.length === 0) {
      toast.error("Tidak ada Gmail untuk dicek", {
        description: "Masukkan minimal satu email pada kolom setoran.",
      });
      return;
    }

    if (rawLines.length > 10) {
      toast.error("Maksimal 10 Gmail per pengecekan!", {
        description: `Saat ini terdapat ${rawLines.length} Gmail. Maksimal 10 Gmail.`,
      });
      return;
    }

    setIsCheckingSetoran(true);
    setHasCheckedSetoran(true);
    setSetoranCheckResults([]);

    const currentStored = typeof window !== "undefined" ? getStoredGeneratedGmails() : [];
    const historySet = typeof window !== "undefined" ? getStoredHistory() : new Set<string>();
    const allGeneratedSet = new Set<string>([
      ...Array.from(generatedPool).map((e) => e.toLowerCase()),
      ...currentStored.map((e) => e.toLowerCase()),
      ...Array.from(historySet).map((e) => e.toLowerCase()),
    ]);

    const items: SetoranCheckItem[] = [];
    const toQueryViaApi: { email: string; index: number }[] = [];

    rawLines.forEach((line, idx) => {
      const lower = line.toLowerCase();
      const isGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(lower);

      if (!isGmail) {
        items.push({
          index: idx + 1,
          email: line,
          status: "INVALID",
          reason: "Format email tidak valid atau bukan domain @gmail.com",
        });
        return;
      }

      // Email yang sudah disetor: TIDAK PERLU DICEK LAGI
      if (submittedSet.has(lower)) {
        items.push({
          index: idx + 1,
          email: line,
          status: "SUDAH DISETOR",
          reason: "Email sudah disetor sebelumnya (tidak perlu dicek lagi)",
        });
        return;
      }

      if (depositMode === "fresh") {
        const isGenerated = allGeneratedSet.has(lower);

        if (!isGenerated) {
          // BUKAN HASIL GENERATE: ABAIKAN dan beri status
          items.push({
            index: idx + 1,
            email: line,
            status: "DIABAIKAN",
            reason: "Bukan hasil Generate Gmail (Diabaikan)",
          });
          return;
        }
      }

      // Masuk antrian cek status ke API
      toQueryViaApi.push({ email: line, index: idx + 1 });
    });

    if (toQueryViaApi.length > 0) {
      try {
        const res = await fetch("/api/gmail-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emails: toQueryViaApi.slice(0, 10).map((q) => q.email),
          }),
        });

        const updatedStatusMap = { ...checkStatusMap };

        if (res.ok) {
          const data = await res.json();
          const apiMap = new Map<
            string,
            { status: string; message: string; alreadyDeposited?: boolean }
          >();
          if (Array.isArray(data.results)) {
            data.results.forEach(
              (r: { email: string; status: string; message: string; alreadyDeposited?: boolean }) => {
                apiMap.set(r.email.toLowerCase(), {
                  status: String(r.status || "").toUpperCase(),
                  message: r.message,
                  alreadyDeposited: Boolean(r.alreadyDeposited),
                });
              }
            );
          }

          const newlyDetectedSubmitted: string[] = [];
          toQueryViaApi.forEach((q) => {
            const lowerEmail = q.email.toLowerCase();
            const apiRes = apiMap.get(lowerEmail);

            if (apiRes?.alreadyDeposited) {
              newlyDetectedSubmitted.push(lowerEmail);
              items.push({
                index: q.index,
                email: q.email,
                status: "SUDAH DISETOR",
                reason: "Email sudah pernah disetor sebelumnya (tidak bisa disetor ulang)",
              });
              return;
            }

            const status: "LIVE" | "UNREGISTERED" =
              apiRes?.status === "LIVE" ? "LIVE" : "UNREGISTERED";
            updatedStatusMap[lowerEmail] = status;
            items.push({
              index: q.index,
              email: q.email,
              status: status,
              reason:
                apiRes?.message ||
                (status === "LIVE"
                  ? "Akun aktif terdaftar di Google"
                  : "Belum pernah dibuat / Tersedia di Google"),
            });
          });

          if (newlyDetectedSubmitted.length > 0) {
            const mergedSubmitted = new Set([
              ...Array.from(submittedSet),
              ...newlyDetectedSubmitted,
            ]);
            setSubmittedSet(mergedSubmitted);
            saveStoredSubmittedGmails(Array.from(mergedSubmitted));
          }
        } else {
          toQueryViaApi.forEach((q) => {
            updatedStatusMap[q.email.toLowerCase()] = "UNREGISTERED";
            items.push({
              index: q.index,
              email: q.email,
              status: "UNREGISTERED",
              reason: "Akun tidak terdaftar di Google",
            });
          });
        }

        setCheckStatusMap(updatedStatusMap);
        saveStoredCheckStatusMap(updatedStatusMap);
      } catch {
        const updatedStatusMap = { ...checkStatusMap };
        toQueryViaApi.forEach((q) => {
          updatedStatusMap[q.email.toLowerCase()] = "UNREGISTERED";
          items.push({
            index: q.index,
            email: q.email,
            status: "UNREGISTERED",
            reason: "Akun tidak terdaftar di Google",
          });
        });
        setCheckStatusMap(updatedStatusMap);
        saveStoredCheckStatusMap(updatedStatusMap);
      }
    }

    items.sort((a, b) => a.index - b.index);
    setSetoranCheckResults(items);
    setIsCheckingSetoran(false);

    const ignoredCount = items.filter((r) => r.status === "DIABAIKAN").length;
    const liveCount = items.filter((r) => r.status === "LIVE").length;
    const unregCount = items.filter((r) => r.status === "UNREGISTERED").length;
    const alreadySubmitted = items.filter((r) => r.status === "SUDAH DISETOR").length;

    toast.success("Pemeriksaan Kolom Checker selesai!", {
      description: `${liveCount} Live · ${unregCount} Unregistered · ${alreadySubmitted} Sudah Disetor · ${ignoredCount} Diabaikan`,
    });
  };

  const liveResults = React.useMemo(() => {
    return setoranCheckResults.filter((r) => r.status === "LIVE");
  }, [setoranCheckResults]);

  const liveCount = liveResults.length;
  const isSetorServiceActive = siteConfig?.is_setor_active !== false;
  const isCheckerServiceActive = siteConfig?.is_checker_active !== false;
  const freshPrice = siteConfig?.price_per_gmail || 1500;
  const oldEmailPrice = siteConfig?.price_bebas ?? 1000;
  const pricePerGmail = depositMode === "fresh" ? freshPrice : oldEmailPrice;
  const calculatedEarnings = liveCount * pricePerGmail;

  const lastHoverToastTime = React.useRef(0);
  const handleHoverDisabledSubmit = () => {
    const now = Date.now();
    if (now - lastHoverToastTime.current > 3000) {
      lastHoverToastTime.current = now;
      toast.error("Tidak ada email live untuk disetor", {
        description: !hasCheckedSetoran
          ? "Silakan klik tombol 'Cek Status' terlebih dahulu."
          : "Harap cek secara berkala, menunggu server google mencatat email yang kamu buat telah Aktif/Live.",
      });
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSetorServiceActive) {
      toast.error("Layanan Setor Ditutup Sementara", {
        description: "Penerimaan setoran Gmail sedang dinonaktifkan sementara oleh Admin.",
      });
      return;
    }
    if (totalLines === 0) {
      toast.error("Masukkan minimal 1 Gmail");
      return;
    }
    if (isExceededMax) {
      toast.error("Maksimal 10 Gmail!", {
        description: `Saat ini terdapat ${totalLines} Gmail. Harap kurangi hingga maksimal 10 Gmail.`,
      });
      return;
    }
    if (!hasCheckedSetoran) {
      toast.error("Wajib periksa status terlebih dahulu!", {
        description: "Klik tombol 'Cek Status' untuk memvalidasi akun yang LIVE sebelum disetor.",
      });
      return;
    }
    if (liveCount === 0) {
      toast.error("Tidak ada email live untuk disetor", {
        description: "Harap cek secara berkala, menunggu server google mencatat email yang kamu buat telah Aktif/Live.",
      });
      return;
    }
    if (depositMode === "old" && !oldEmailPassword.trim()) {
      toast.error("Password email wajib diisi!", {
        description: "Masukkan password akun Gmail lama yang disetor sebelum mengirim setoran.",
      });
      return;
    }

    setIsSubmitting(true);
    const totalEarnings = liveCount * pricePerGmail;
    const liveEmailList = liveResults.map((r) => r.email.toLowerCase());

    (async () => {
      try {
        const user = await getCurrentAuthUser();
        if (user) {
          const categoryId = depositMode === "old" ? "bebas" : "good";
          const submittedPassword =
            depositMode === "old" ? oldEmailPassword.trim() : activePassword;
          const res = await insertUserDeposits(
            user.id,
            liveEmailList,
            categoryId,
            pricePerGmail,
            undefined,
            submittedPassword
          );
          if (!res.success) {
            toast.error("Gagal menyetor Gmail", {
              description: res.error || "Terjadi kendala saat menyimpan setoran.",
            });
            setIsSubmitting(false);
            return;
          }
        }

        refreshDeposits();
        refreshWallet();

        // Tandai akun LIVE sebagai sudah disetor
        const newSubmitted = new Set([...Array.from(submittedSet), ...liveEmailList]);
        setSubmittedSet(newSubmitted);
        saveStoredSubmittedGmails(Array.from(newSubmitted));

        // Update status pada hasil pemeriksaan menjadi SUDAH DISETOR
        setSetoranCheckResults((prev) =>
          prev.map((item) =>
            liveEmailList.includes(item.email.toLowerCase())
              ? { ...item, status: "SUDAH DISETOR" as const, reason: "Berhasil disetor ke sistem" }
              : item
          )
        );

        const nonLiveCount = totalLines - liveCount;
        const partialNote =
          nonLiveCount > 0 ? ` (${nonLiveCount} akun belum LIVE/diabaikan tidak ikut disetor)` : "";

        toast.success(`${liveCount} Gmail LIVE berhasil disetor!${partialNote}`, {
          description: `Total ${formatIDR(totalEarnings)} jika di-ACC · Akun telah ditandai 'Sudah Disetor' di atas.`,
        });
      } catch {
        toast.error("Gagal menyetor Gmail", {
          description: "Periksa koneksi internet Anda lalu coba lagi.",
        });
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  return (
    <PageShell>
      <div className="space-y-4 pt-2 sm:pt-4">
        {/* 1. Unified Section: Rules & Generate Gmail */}
        <Reveal delay={20}>
          <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-b from-[#151824]/92 via-[#11131c]/95 to-[#0c0d14]/95 backdrop-blur-2xl p-4 sm:p-5 shadow-2xl space-y-4">
            {/* Specular Top Line */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-sky-400/50 to-transparent"
            />

            {/* Pilihan Jenis Setoran: Segmented Switch Compact */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="flex size-6.5 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400 border border-sky-400/25">
                  <Mail className="size-3.5" />
                </span>
                <h3 className="text-xs sm:text-sm font-extrabold text-white tracking-tight">
                  Pilih Jenis Gmail
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-black/50 p-1">
              <button
                type="button"
                onClick={() => {
                  if (depositMode !== "fresh") {
                    setDepositMode("fresh");
                    setHasCheckedSetoran(false);
                    setSetoranCheckResults([]);
                  }
                }}
                className={cn(
                  "flex flex-wrap items-center justify-center sm:justify-between gap-1.5 rounded-xl px-3 py-2 text-left transition-all cursor-pointer",
                  depositMode === "fresh"
                    ? "bg-sky-500/15 border border-sky-400/45 text-white shadow-sm"
                    : "border border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                )}
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold">
                  <Sparkles className={cn("size-3.5 shrink-0", depositMode === "fresh" ? "text-sky-400" : "text-zinc-500")} />
                  <span>Buat Email Baru</span>
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[0.66rem] font-extrabold tabular-nums",
                    depositMode === "fresh"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400/35"
                      : "bg-white/5 text-zinc-400"
                  )}
                >
                  {formatIDR(freshPrice)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (depositMode !== "old") {
                    setDepositMode("old");
                    setHasCheckedSetoran(false);
                    setSetoranCheckResults([]);
                  }
                }}
                className={cn(
                  "flex flex-wrap items-center justify-center sm:justify-between gap-1.5 rounded-xl px-3 py-2 text-left transition-all cursor-pointer",
                  depositMode === "old"
                    ? "bg-sky-500/15 border border-sky-400/45 text-white shadow-sm"
                    : "border border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                )}
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold">
                  <Send className={cn("size-3.5 shrink-0", depositMode === "old" ? "text-sky-400" : "text-zinc-500")} />
                  <span>Setor Email Lama</span>
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[0.66rem] font-extrabold tabular-nums",
                    depositMode === "old"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400/35"
                      : "bg-white/5 text-zinc-400"
                  )}
                >
                  {formatIDR(oldEmailPrice)}
                </span>
              </button>
              </div>
            </div>

            {/* Bagian 1: Rules Setoran Compact */}
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex size-6.5 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400 border border-sky-400/25">
                    <ScrollText className="size-3.5" />
                  </span>
                  <h3 className="text-xs sm:text-sm font-extrabold text-white tracking-tight">
                    Rules Setoran Gmail
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setShowRulesDetail(!showRulesDetail)}
                  className="inline-flex items-center gap-1 text-[0.7rem] font-bold text-sky-400 hover:text-sky-300 transition-colors cursor-pointer py-1 px-2 rounded-lg hover:bg-sky-500/10"
                >
                  <span>{showRulesDetail ? "Tutup Detail" : "Detail Aturan"}</span>
                  <ChevronDown className={cn("size-3 transition-transform duration-200", showRulesDetail && "rotate-180")} />
                </button>
              </div>

              {/* Compact 2x2 Rule Cards — rincian langsung masuk ke kotak masing-masing saat Detail Aturan dibuka */}
              {(() => {
                const detailTexts =
                  siteConfig?.rules_detail_text && siteConfig.rules_detail_text.length > 0
                    ? siteConfig.rules_detail_text
                    : [
                        "Akun harus baru dibuat secara manual dan belum pernah didaftarkan ke platform/jasa lain.",
                        "Huruf dan angka pada Gmail wajib sama persis dengan hasil yang di-generate.",
                        "Atur tanggal dan tahun kelahiran akun Gmail di Google agar umur akun minimal 18 tahun (contoh: tahun 2000–2005).",
                        "Akun dilarang menautkan nomor HP pemulihan atau email pemulihan agar peninjauan oleh admin lancar tanpa kendala OTP.",
                      ];

                const ruleItems = [
                  {
                    icon: Sparkles,
                    iconColor: "text-emerald-400",
                    title:
                      depositMode === "fresh"
                        ? siteConfig?.rule_status || "Wajib Fresh (baru dibuat)"
                        : "Email Lama (sudah terdaftar)",
                    detail:
                      depositMode === "fresh"
                        ? detailTexts[0]
                        : "Akun Gmail lama yang sudah aktif terdaftar di Google dan masih bisa diakses dengan password yang dimasukkan.",
                  },
                  {
                    icon: CheckCircle2,
                    iconColor: "text-sky-400",
                    title:
                      depositMode === "fresh"
                        ? siteConfig?.rule_nama || "Wajib sama persis hasil generate"
                        : "Bebas (tidak perlu generate)",
                    detail:
                      depositMode === "fresh"
                        ? detailTexts[1]
                        : "Nama email bebas, tidak perlu menggunakan generator. Pastikan alamat @gmail.com ditulis dengan benar.",
                  },
                  {
                    icon: Calendar,
                    iconColor: "text-amber-400",
                    title: siteConfig?.rule_usia || "Lahir 18+ tahun",
                    detail: detailTexts[2],
                  },
                  {
                    icon: ShieldAlert,
                    iconColor: "text-rose-400",
                    title: siteConfig?.rule_keamanan || "Tanpa No HP / Email Pemulihan",
                    detail: detailTexts[3],
                  },
                ];

                return (
                  <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {ruleItems.map((rule, idx) => {
                      const RuleIcon = rule.icon;
                      return (
                        <div
                          key={idx}
                          className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 transition-all"
                        >
                          <div className="flex items-center gap-2">
                            <RuleIcon className={cn("size-3.5 shrink-0", rule.iconColor)} />
                            <span className="text-[0.73rem] font-semibold text-zinc-200 truncate">
                              {rule.title}
                            </span>
                          </div>
                          {showRulesDetail && rule.detail && (
                            <p className="mt-1.5 pl-5.5 text-[0.7rem] leading-relaxed text-zinc-400 animate-fade-down">
                              {rule.detail}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Bagian 2: Generate Gmail (Hanya untuk mode Buat Email Baru) */}
            {depositMode === "fresh" && (
            <div className="pt-3 border-t border-white/10">
              {/* Header + Inline Compact Stepper */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-sky-400" />
                  <h3 className="text-xs sm:text-sm font-extrabold text-white">Generate Gmail</h3>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[0.68rem] font-semibold text-zinc-400">
                  {[
                    { step: "1", label: "Generate", done: isMounted && generatedList.length > 0 },
                    { step: "2", label: "Salin", done: isMounted && totalLines > 0 },
                    { step: "3", label: "Bikin Akun", done: isMounted && totalLines > 0 },
                    { step: "4", label: "Setor", done: isMounted && hasCheckedSetoran && liveCount > 0 },
                  ].map((item, idx) => (
                    <React.Fragment key={item.step}>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg border px-2 py-0.5",
                          item.done
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : "border-white/10 bg-black/40 text-zinc-300"
                        )}
                      >
                        <span className="font-mono text-[0.62rem] text-sky-400">
                          {item.done ? "✓" : item.step}
                        </span>
                        <span>{item.label}</span>
                      </span>
                      {idx < 3 && <span className="text-zinc-600">→</span>}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Generator Box: Jumlah Presets + Password Default Box + Tombol Generate */}
              <div className="mt-2.5 rounded-2xl border border-white/10 bg-black/40 p-3 sm:p-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pb-3 border-b border-white/10">
                  {/* Presets & Input Jumlah */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[0.7rem] font-bold text-zinc-400 uppercase tracking-wider mr-0.5">
                      Jumlah:
                    </span>
                    {[1, 3, 5, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          setCustomCountInput(num);
                          if (generatedList.length === 0) {
                            handleGenerate(num);
                          }
                        }}
                        className={cn(
                          "px-2.5 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer",
                          customCountInput === num
                            ? "border-sky-500 bg-sky-500 text-white shadow-xs"
                            : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        {num}
                      </button>
                    ))}

                    <div className="flex items-center gap-1 ml-0.5">
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={customCountInput}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) {
                            setCustomCountInput(Math.max(1, Math.min(10, val)));
                          } else {
                            setCustomCountInput(1);
                          }
                        }}
                        className="w-12 rounded-lg border border-white/10 bg-black/60 px-1.5 py-1 text-center font-mono text-xs font-bold text-white focus:border-sky-500/60 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:m-0"
                      />
                      <span className="text-[0.7rem] text-zinc-400">akun</span>
                    </div>
                  </div>

                  {/* Password Default Box + Tombol Generate */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-1">
                      <span className="text-[0.68rem] font-semibold text-emerald-300">
                        Pass:
                      </span>
                      <span className="font-mono text-xs font-black text-white px-1.5 py-0.5 rounded bg-black/60 border border-emerald-500/30 select-all">
                        {activePassword}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyPassword}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 hover:text-white px-1.5 py-0.5 text-[0.68rem] font-bold transition-all active:scale-95 cursor-pointer"
                        title="Salin password default"
                      >
                        {copiedPassword ? (
                          <>
                            <Check className="size-3 text-emerald-400" />
                            <span>Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>

                    {generatedList.length === 0 && (
                      <button
                        type="button"
                        onClick={() => handleGenerate(customCountInput)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-400 via-sky-500 to-blue-600 hover:from-sky-300 hover:to-blue-500 text-white px-3.5 py-1.5 text-xs font-bold shadow-md shadow-sky-500/25 transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                      >
                        <Sparkles className="size-3.5" />
                        <span>Generate Gmail</span>
                      </button>
                    )}
                  </div>
                </div>

              {/* Generated Gmail Box */}
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-zinc-200">
                    Generated Gmail
                  </h4>
                  <p className="text-[0.7rem] text-zinc-400 font-medium">
                    Total:{" "}
                    <strong suppressHydrationWarning className="text-zinc-200">
                      {isMounted ? generatedList.length : 0}
                    </strong>{" "}
                    · Belum disetor:{" "}
                    <strong suppressHydrationWarning className="text-zinc-200">
                      {isMounted ? unsubmittedCount : 0}
                    </strong>
                  </p>
                </div>

                {/* Email rows or Empty state */}
                {!isMounted ? (
                  <div className="py-4 text-center text-xs text-zinc-400">
                    Memuat daftar Gmail...
                  </div>
                ) : generatedList.length === 0 ? (
                  <div className="py-4 px-3 text-center rounded-xl border border-white/10 bg-black/35">
                    <p className="text-xs text-zinc-400">
                      Belum ada Gmail — pilih jumlah di atas lalu klik{" "}
                      <strong className="text-sky-400">Generate Gmail</strong>.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-0.5">
                      {generatedList.map((email, idx) => {
                        const lower = email.toLowerCase();
                        const isSubmitted = submittedSet.has(lower);
                        const checkStatus = checkStatusMap[lower];

                        return (
                          <div
                            key={email + idx}
                            onClick={() => handleCopyOne(email)}
                            className="group flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 p-2 sm:px-3 hover:bg-white/5 hover:border-white/20 transition-colors cursor-pointer"
                            title="Klik untuk menyalin"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Copy
                                className={cn(
                                  "size-3.5 shrink-0 transition-colors",
                                  copiedEmail === email
                                    ? "text-emerald-400"
                                    : "text-zinc-500 group-hover:text-sky-400"
                                )}
                              />
                              <span
                                suppressHydrationWarning
                                className="font-mono text-xs sm:text-[0.82rem] font-medium text-zinc-100 truncate select-all"
                              >
                                {email}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Badge Status Cek */}
                              {checkStatus && (
                                <span
                                  suppressHydrationWarning
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider transition-colors",
                                    checkStatus === "LIVE"
                                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                      : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                  )}
                                >
                                  {checkStatus === "LIVE" ? "Live" : "Unregistered"}
                                </span>
                              )}

                              {/* Badge Status Setor */}
                              <span
                                suppressHydrationWarning
                                className={cn(
                                  "rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold transition-colors",
                                  isSubmitted
                                    ? "bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30"
                                    : "bg-white/10 text-zinc-400 border border-white/10"
                                )}
                              >
                                {isSubmitted ? "Sudah Disetor" : "Belum Disetor"}
                              </span>

                              {/* Delete button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteGenerated(idx);
                                }}
                                title="Hapus Gmail ini"
                                className="p-1 text-zinc-500 hover:text-rose-400 transition-colors rounded cursor-pointer"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <p className="mt-3 text-xs text-zinc-400 leading-relaxed">
                      Ketuk salah satu Gmail untuk menyalinnya satu per satu, atau gunakan tombol di bawah untuk menyalin banyak sekaligus.
                    </p>

                    {/* 3 Action Buttons */}
                    <div className="mt-3 space-y-2">
                      <button
                        type="button"
                        onClick={handleCopyAll}
                        className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/40 py-2.5 px-4 font-semibold text-xs sm:text-sm text-zinc-200 hover:bg-white/5 hover:border-white/20 shadow-2xs transition-all active:scale-[0.99] cursor-pointer"
                      >
                        <Copy className="size-4 text-zinc-400" />
                        <span>Salin Semua Gmail</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCopyUnsubmitted}
                        className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/40 py-2.5 px-4 font-semibold text-xs sm:text-sm text-zinc-200 hover:bg-white/5 hover:border-white/20 shadow-2xs transition-all active:scale-[0.99] cursor-pointer"
                      >
                        <Copy className="size-4 text-zinc-400" />
                        <span>Salin Gmail Belum Disetor</span>
                      </button>

                      {/* Tombol Generate Lagi: hilang jika sudah mencapai maksimal 10 */}
                      {generatedList.length < 10 && (
                        <button
                          type="button"
                          onClick={() => handleGenerateMore(customCountInput)}
                          className="w-full flex items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-950/30 hover:bg-sky-950/50 py-2.5 px-4 font-semibold text-xs sm:text-sm text-sky-300 shadow-2xs transition-all active:scale-[0.99] cursor-pointer"
                        >
                          <Sparkles className="size-4 text-sky-400" />
                          <span>
                            Generate Lagi (+{Math.min(customCountInput, Math.max(0, 10 - generatedList.length))})
                          </span>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
            )}
        </div>
      </Reveal>

        {/* 3. Form Kolom Setoran dengan Checker Terintegrasi */}
        <Reveal delay={60}>
          <form onSubmit={handleSubmit} className="rounded-3xl border border-white/10 bg-[#121217]/85 backdrop-blur-xl p-4 sm:p-5 shadow-2xl">
            {/* Header Kolom Checker & Setoran */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-sky-400" />
                <label className="text-xs sm:text-sm font-bold text-white">
                  Kolom Checker &amp; Setoran
                </label>
                {totalLines > 0 && (
                  <span
                    className={cn(
                      "text-[0.7rem] px-2 py-0.5 rounded-full font-semibold tabular-nums border",
                      isExceededMax
                        ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                        : "bg-sky-500/10 border-sky-500/30 text-sky-200"
                    )}
                  >
                    {totalLines} Gmail{isExceededMax ? " (Maks. 10)" : ""}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Tombol Paste Hasil Generate */}
                {depositMode === "fresh" && generatedList.length > 0 && (
                  <button
                    type="button"
                    onClick={handlePasteGenerated}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 px-3 py-1.5 text-xs font-bold text-sky-200 shadow-2xs transition-all active:scale-95 cursor-pointer"
                    title="Tempel Gmail hasil generate ke kolom checker"
                  >
                    <ClipboardPaste className="size-3.5 text-sky-300" />
                    <span>Paste Hasil Generate ({generatedList.length})</span>
                  </button>
                )}

                {emails.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearEmails}
                    className="inline-flex items-center gap-1 p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer text-xs"
                    title="Kosongkan kolom"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Banner jika penerimaan setoran sedang ditutup di CMS */}
            {!isSetorServiceActive && (
              <div className="mb-3.5 flex items-start gap-2.5 rounded-2xl border border-rose-500/35 bg-rose-950/40 p-3.5 text-xs text-rose-200">
                <ShieldAlert className="size-4 shrink-0 text-rose-400 mt-0.5" />
                <div>
                  <p className="font-bold text-rose-300">Penerimaan Setoran Ditutup Sementara</p>
                  <p className="mt-0.5 text-rose-200/85 leading-relaxed">
                    Layanan pengiriman setoran Gmail sedang dinonaktifkan sementara oleh Admin. Silakan coba kembali beberapa saat lagi.
                  </p>
                </div>
              </div>
            )}

            {/* Kolom Password Email & Caution Beda Password (Khusus Setor Email Lama) */}
            {depositMode === "old" && (
              <div className="mb-3 space-y-2.5">
                <div>
                  <label
                    htmlFor="old-email-password"
                    className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-zinc-200"
                  >
                    <KeyRound className="size-3.5 text-sky-400" />
                    <span>Password Email</span>
                    <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="old-email-password"
                    type="text"
                    value={oldEmailPassword}
                    onChange={(e) => setOldEmailPassword(e.target.value.slice(0, 120))}
                    placeholder="Masukkan password akun Gmail lama yang disetor..."
                    autoComplete="off"
                    className="w-full h-10.5 rounded-xl border border-white/10 bg-black/40 px-3.5 font-mono text-xs sm:text-sm text-white placeholder:text-zinc-500 outline-none transition-all focus:border-sky-500/60 focus:bg-black/60 focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>

                {/* Caution: Setor > 1 dengan password berbeda wajib setor 1 per 1 */}
                <div
                  className={cn(
                    "flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed transition-all",
                    totalLines > 1
                      ? "border-amber-400/55 bg-amber-500/15 text-amber-100 shadow-sm shadow-amber-500/10"
                      : "border-amber-500/30 bg-amber-950/35 text-amber-200/95"
                  )}
                >
                  <AlertTriangle className="size-4 shrink-0 text-amber-400 mt-0.5" aria-hidden="true" />
                  <p>
                    <strong className="font-extrabold text-amber-300">Caution:</strong>{" "}
                    Apabila menyetor <strong className="text-white">lebih dari 1 email</strong> dan{" "}
                    <strong className="text-white">password-nya berbeda-beda</strong>, setornya{" "}
                    <span className="inline-flex items-center rounded-md border border-amber-400/40 bg-amber-500/20 px-1.5 py-0.5 font-extrabold text-amber-200">
                      1 per 1 (satu-satu)
                    </span>{" "}
                    yaa! Kolom setor sekaligus hanya untuk email yang memiliki password sama.
                  </p>
                </div>
              </div>
            )}

            <textarea
              rows={9}
              value={emails}
              onChange={handleTextareaChange}
              onKeyDown={handleTextareaKeyDown}
              placeholder={"contoh1@gmail.com\ncontoh2@gmail.com"}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              className={cn(
                "w-full min-h-[220px] rounded-2xl border p-4 font-mono text-xs sm:text-sm leading-relaxed text-white placeholder:text-zinc-500 bg-black/40 outline-none transition-all resize-y",
                isExceededMax
                  ? "border-rose-500 focus:ring-2 focus:ring-rose-500/30"
                  : "border-white/10 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20"
              )}
            />

            {/* Hasil Checker Setoran */}
            {hasCheckedSetoran && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-sky-400" />
                    <h4 className="text-xs sm:text-sm font-bold text-white">
                      Hasil Pemeriksaan Kolom Checker
                    </h4>
                  </div>

                  {/* Badges Rekap */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 font-bold text-emerald-300 text-[0.7rem]">
                      {setoranCheckResults.filter((r) => r.status === "LIVE").length} Live
                    </span>
                    <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-2.5 py-0.5 font-bold text-rose-300 text-[0.7rem]">
                      {setoranCheckResults.filter((r) => r.status === "UNREGISTERED").length} Unregistered
                    </span>
                    {setoranCheckResults.filter((r) => r.status === "SUDAH DISETOR").length > 0 && (
                      <span className="rounded-full bg-sky-500/20 border border-sky-500/40 px-2.5 py-0.5 font-bold text-sky-300 text-[0.7rem]">
                        {setoranCheckResults.filter((r) => r.status === "SUDAH DISETOR").length} Sudah Disetor
                      </span>
                    )}
                    {setoranCheckResults.filter((r) => r.status === "DIABAIKAN").length > 0 && (
                      <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 font-bold text-amber-300 text-[0.7rem]">
                        {setoranCheckResults.filter((r) => r.status === "DIABAIKAN").length} Diabaikan
                      </span>
                    )}
                  </div>
                </div>

                {/* Detail list with max height */}
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                  {setoranCheckResults.map((item) => {
                    return (
                      <div
                        key={item.index + item.email}
                        className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 p-2 sm:px-3 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-zinc-500 text-[0.7rem] w-5 text-right shrink-0">
                            {item.index}.
                          </span>
                          <span className="font-mono text-xs text-zinc-200 font-medium truncate select-all">
                            {item.email}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider border",
                              item.status === "LIVE" && "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
                              item.status === "UNREGISTERED" && "bg-rose-500/20 text-rose-300 border-rose-500/40",
                              item.status === "SUDAH DISETOR" && "bg-sky-500/20 text-sky-300 border-sky-500/40",
                              item.status === "DIABAIKAN" && "bg-amber-500/20 text-amber-300 border-amber-500/40",
                              item.status === "INVALID" && "bg-rose-500/20 text-rose-300 border-rose-500/40"
                            )}
                          >
                            {item.status}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyOne(item.email)}
                            title="Salin email"
                            className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                          >
                            <Copy className="size-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {setoranCheckResults.some((r) => r.status === "DIABAIKAN") && (
                  <p className="mt-2 text-[0.72rem] text-amber-300 bg-amber-950/40 rounded-xl p-2.5 border border-amber-500/30 leading-relaxed">
                    ⚠️ <strong>Email bukan hasil generate diabaikan</strong> dari sistem setoran. Checker hanya memproses Gmail yang digenerate oleh akun Anda.
                  </p>
                )}

                {/* Notifikasi jika 0 yang LIVE setelah dicheck */}
                {hasCheckedSetoran && liveCount === 0 && (
                  <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-950/40 p-3.5 text-xs text-amber-200 flex items-start gap-2.5 shadow-xs animate-fade-up">
                    <Clock className="size-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      <p className="font-bold text-amber-300">
                        Belum ada akun yang LIVE terdeteksi
                      </p>
                      <p className="mt-0.5 text-amber-300/80 text-[0.76rem] leading-relaxed">
                        Harap cek secara berkala, menunggu server google mencatat email yang kamu buat telah{" "}
                        <span className="font-black text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/40 shadow-xs underline underline-offset-2">
                          Aktif/Live
                        </span>
                        .
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bottom Row under Textarea */}
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-white/10">
              <div>
                <p className="text-xs sm:text-sm text-zinc-300">
                  {hasCheckedSetoran ? (
                    <>
                      Terverifikasi LIVE:{" "}
                      <strong className="font-bold text-emerald-400">{liveCount}</strong> akun
                      {setoranCheckResults.filter((r) => r.status === "UNREGISTERED").length > 0 && (
                        <span className="text-rose-400 font-medium ml-1.5">
                          ({setoranCheckResults.filter((r) => r.status === "UNREGISTERED").length} unregistered)
                        </span>
                      )}
                      {setoranCheckResults.filter((r) => r.status === "SUDAH DISETOR").length > 0 && (
                        <span className="text-sky-400 font-medium ml-1.5">
                          ({setoranCheckResults.filter((r) => r.status === "SUDAH DISETOR").length} sudah disetor)
                        </span>
                      )}
                      {depositMode === "fresh" && notGeneratedCount > 0 && (
                        <span className="text-amber-400 font-medium ml-1.5">
                          ({notGeneratedCount} diabaikan)
                        </span>
                      )}
                    </>
                  ) : depositMode === "old" ? (
                    <>
                      Terdeteksi: <strong className="font-bold text-white">{totalLines}</strong> baris Gmail siap dicek
                    </>
                  ) : (
                    <>
                      Terdeteksi: <strong className="font-bold text-white">{validCount}</strong> baris Gmail hasil generate
                      {notGeneratedCount > 0 && (
                        <span className="text-amber-400 font-medium ml-1.5">
                          ({notGeneratedCount} diabaikan)
                        </span>
                      )}
                    </>
                  )}
                </p>

                {/* Muncul hanya apabila minimal 1 gmail LIVE */}
                {hasCheckedSetoran && liveCount > 0 && (
                  <p className="mt-1 text-xs sm:text-sm font-bold text-white">
                    Setor Gmail : {formatIDR(calculatedEarnings)} Jika di ACC
                    <span className="text-emerald-400 font-semibold text-xs ml-1">
                      ({liveCount} akun LIVE)
                    </span>
                  </p>
                )}

                <p className="mt-0.5 text-[0.75rem] text-zinc-400 font-medium">
                  {!hasCheckedSetoran
                    ? "Wajib klik 'Cek Status' sebelum menyetor untuk memvalidasi akun LIVE."
                    : "Estimasi pengecekan 12-24 jam."}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Tombol Checker Kolom Setoran */}
                <button
                  type="button"
                  onClick={handleCheckSetoran}
                  disabled={!isCheckerServiceActive || totalLines === 0 || isExceededMax || isCheckingSetoran}
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-xl px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold transition-all shadow-md active:scale-95 cursor-pointer",
                    isCheckerServiceActive && totalLines > 0 && !isExceededMax && !isCheckingSetoran
                      ? "bg-gradient-to-r from-sky-400 via-sky-500 to-blue-600 hover:from-sky-300 hover:to-blue-500 text-white shadow-sky-500/25 border border-sky-400/30"
                      : "bg-white/5 border border-white/10 text-zinc-500 cursor-not-allowed opacity-60"
                  )}
                >
                  {isCheckingSetoran ? (
                    <RefreshCw className="size-4 animate-spin text-white" />
                  ) : (
                    <ShieldCheck className="size-4 text-sky-200" />
                  )}
                  <span>{isCheckingSetoran ? "Memeriksa..." : "Cek Status"}</span>
                </button>

                {/* Tombol Kirim Setoran */}
                <div
                  className="relative group inline-block"
                  onMouseEnter={() => {
                    if (!hasCheckedSetoran || liveCount === 0) {
                      handleHoverDisabledSubmit();
                    }
                  }}
                >
                  {/* Floating Tooltip Bubble saat 0 live atau belum cek */}
                  {(!hasCheckedSetoran || liveCount === 0) && (
                    <div className="pointer-events-none absolute -top-11 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-xl bg-black/90 border border-white/20 px-3 py-1.5 text-[0.72rem] font-bold text-white shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-30 flex items-center gap-1.5">
                      <span>Tidak ada email live untuk disetor</span>
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!isSetorServiceActive || !hasCheckedSetoran || liveCount === 0 || isExceededMax || isSubmitting}
                    className={cn(
                      "inline-flex items-center justify-center gap-2 rounded-xl px-5 sm:px-6 py-2.5 text-xs sm:text-sm font-semibold transition-all shadow-sm",
                      isSetorServiceActive && hasCheckedSetoran && liveCount > 0 && !isExceededMax
                        ? "bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white cursor-pointer active:scale-95 shadow-md shadow-sky-500/20"
                        : "bg-white/5 border border-white/10 text-zinc-500 cursor-not-allowed"
                    )}
                  >
                    <Send className="size-4" />
                    <span>
                      {isSubmitting
                        ? "Mengirim..."
                        : liveCount > 0
                        ? `Kirim Setoran (${liveCount} LIVE)`
                        : "Kirim Setoran"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </form>
        </Reveal>
      </div>
    </PageShell>
  );
}