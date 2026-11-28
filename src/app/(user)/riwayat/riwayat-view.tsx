"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarDays,
  Mail,
  CircleCheck,
  CircleX,
  ScanSearch,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Smartphone,
  ShieldAlert,
  HelpCircle,
} from "lucide-react";
import { Card, SectionHeading } from "@/components/ui/card";
import { StatusSummaryGrid, type StatusCardItem } from "@/components/ui/status-summary-cards";
import { StatusBadge, type Tone } from "@/components/ui/status";
import { PageShell, Reveal, EmptyState } from "@/components/layout/page-shell";
import {
  timeRanges,
  type DepositRecord,
  type TimeRange,
  isAcceptedDepositStatus,
  isPendingDepositStatus,
  isRejectedDepositStatus,
  isIssueDepositStatus,
} from "@/lib/mock-data";
import { cn, formatDateTime, formatIDR } from "@/lib/utils";
import { useUserProfile } from "@/context/user-profile-context";
import { Skeleton } from "@/components/ui/skeleton";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

type StatusMetaEntry = {
  label: string;
  tone: Tone;
  icon: React.ReactNode;
};

const FALLBACK_STATUS_META: StatusMetaEntry = {
  label: "Tidak Diketahui",
  tone: "neutral",
  icon: <HelpCircle className="size-3" aria-hidden="true" />,
};

const statusMeta: Record<string, StatusMetaEntry> = {
  diterima: {
    label: "Diterima",
    tone: "success",
    icon: <CircleCheck className="size-3" aria-hidden="true" />,
  },
  accepted: {
    label: "Diterima",
    tone: "success",
    icon: <CircleCheck className="size-3" aria-hidden="true" />,
  },
  pending: {
    label: "Di Cek",
    tone: "info",
    icon: <ScanSearch className="size-3" aria-hidden="true" />,
  },
  dicek: {
    label: "Di Cek",
    tone: "info",
    icon: <ScanSearch className="size-3" aria-hidden="true" />,
  },
  ditolak: {
    label: "Ditolak",
    tone: "danger",
    icon: <CircleX className="size-3" aria-hidden="true" />,
  },
  rejected: {
    label: "Ditolak",
    tone: "danger",
    icon: <CircleX className="size-3" aria-hidden="true" />,
  },
  need_2fa: {
    label: "Butuh 2FA",
    tone: "warning",
    icon: <AlertTriangle className="size-3" aria-hidden="true" />,
  },
  need_phone_verify: {
    label: "Butuh Verifikasi HP",
    tone: "warning",
    icon: <Smartphone className="size-3" aria-hidden="true" />,
  },
  captcha_checkpoint: {
    label: "Terkena Captcha",
    tone: "warning",
    icon: <ShieldAlert className="size-3" aria-hidden="true" />,
  },
  unknown: {
    label: "Tidak Diketahui",
    tone: "neutral",
    icon: <HelpCircle className="size-3" aria-hidden="true" />,
  },
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function withinRange(iso: string, range: TimeRange): boolean {
  if (range === "all") return true;
  const diff = Date.now() - new Date(iso).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (range === "today") return diff < day;
  if (range === "7d") return diff < 7 * day;
  return diff < 30 * day;
}

/* ------------------------------------------------------------------ */
/* Row                                                                 */
/* ------------------------------------------------------------------ */

function DepositRow({ record, index }: { record: DepositRecord; index: number }) {
  const statusKey = String(record.status || "").toLowerCase().trim();
  const meta = statusMeta[statusKey] ?? FALLBACK_STATUS_META;
  const isAccepted = isAcceptedDepositStatus(statusKey);
  const isPending = isPendingDepositStatus(statusKey);
  const isRejected = isRejectedDepositStatus(statusKey);
  const isIssue = isIssueDepositStatus(statusKey);
  const cleanNote =
    record.note && !/^Password:\s*/i.test(record.note.trim()) ? record.note.trim() : "";

  return (
    <div
      className="animate-fade-up group flex items-center gap-3 px-4 py-3.5 transition-colors duration-300 hover:bg-white/5 sm:gap-4 sm:px-5 md:px-6 md:py-4"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-105 md:size-11",
          isAccepted && "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
          isPending && "bg-sky-500/10 text-sky-400 border border-sky-500/20",
          isRejected && "bg-rose-500/10 text-rose-400 border border-rose-500/20",
          isIssue &&
            (statusKey === "unknown"
              ? "bg-zinc-500/15 text-zinc-300 border border-zinc-500/25"
              : "bg-amber-500/10 text-amber-400 border border-amber-500/25"),
        )}
      >
        <Mail className="size-4.5" strokeWidth={2.1} aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[0.82rem] font-semibold text-zinc-100">
          {record.gmail}
        </p>
        <p className="mt-0.5 truncate text-[0.7rem] text-zinc-400">
          {formatDateTime(record.createdAt)} · {record.category === "good" ? "Good" : "Bebas"}
        </p>
        {(isRejected || isIssue) && cleanNote && (
          <p
            className={cn(
              "mt-1 truncate text-[0.7rem] font-medium",
              isRejected ? "text-rose-400" : "text-amber-400",
            )}
          >
            {cleanNote}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-[0.85rem] font-bold tracking-tight text-white tabular-nums">
          {formatIDR(record.amount)}
        </span>
        <StatusBadge tone={meta.tone} icon={meta.icon} dot pulse={isPending}>
          {meta.label}
        </StatusBadge>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

export function RiwayatView() {
  const { deposits, isDepositsLoading } = useUserProfile();
  const [range, setRange] = React.useState<TimeRange>("all");

  const filtered = React.useMemo(() => {
    return deposits
      .filter((d) => withinRange(d.createdAt, range))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [deposits, range]);

  const counts = React.useMemo(() => {
    const base: Record<string, number> = {
      semua: 0,
      diterima: 0,
      dicek: 0,
      bermasalah: 0,
      ditolak: 0,
    };
    for (const d of deposits) {
      if (withinRange(d.createdAt, range)) {
        base.semua += 1;
        if (isPendingDepositStatus(d.status)) {
          base.dicek += 1;
        } else if (isAcceptedDepositStatus(d.status)) {
          base.diterima += 1;
        } else if (isRejectedDepositStatus(d.status)) {
          base.ditolak += 1;
        } else if (isIssueDepositStatus(d.status)) {
          base.bermasalah += 1;
        }
      }
    }
    return base;
  }, [deposits, range]);

  const riwayatStatusItems: StatusCardItem[] = React.useMemo(
    () => [
      {
        title: "Total Setoran",
        value: counts.semua,
        bg: "bg-zinc-950",
        svgType: "circles",
      },
      {
        title: "Diterima",
        value: counts.diterima,
        bg: "bg-emerald-600",
        svgType: "blur2",
      },
      {
        title: "Di Cek",
        value: counts.dicek,
        bg: "bg-sky-600",
        svgType: "blur4",
      },
      {
        title: "Butuh Tindakan",
        value: counts.bermasalah,
        bg: "bg-amber-600",
        svgType: "blur4",
      },
      {
        title: "Ditolak",
        value: counts.ditolak,
        bg: "bg-rose-600",
        svgType: "blur3",
      },
    ],
    [counts],
  );

  return (
    <PageShell>
      <div className="flex flex-col justify-center min-h-[calc(100dvh-10rem)] py-6 sm:py-10">
        <div className="w-full my-auto space-y-5">
          {/* Ringkasan status */}
          <Reveal delay={40}>
            <SectionHeading
              title="Ringkasan Status"
              icon={<ShieldCheck className="size-4 text-sky-400" aria-hidden="true" />}
            />

            {/* Filter Rentang Waktu (Hari ini, 7 Hari, 30 Hari, Semua) ditaruh tepat di bawah teks Ringkasan Status dan di atas Card Total Setoran dll */}
            <div className="mt-3.5 mb-3.5 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 p-1.5 shadow-card md:gap-3 md:p-2">
              <span className="flex shrink-0 items-center gap-1.5 pl-2 pr-1 text-[0.72rem] font-semibold text-zinc-400">
                <CalendarDays className="size-3.5" aria-hidden="true" />
              </span>
              {timeRanges.map((option) => {
                const isActive = range === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRange(option.value)}
                    aria-pressed={isActive}
                    className={cn(
                      "flex-1 rounded-xl px-2 py-2 text-[0.76rem] font-semibold transition-[background-color,color,box-shadow] duration-300 cursor-pointer",
                      isActive
                        ? "bg-gradient-to-r from-sky-400 via-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/30 font-bold"
                        : "text-zinc-400 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <StatusSummaryGrid items={riwayatStatusItems} isLoading={isDepositsLoading} />
          </Reveal>

          {/* List */}
          <Reveal delay={80}>
            {isDepositsLoading ? (
              <Card className="overflow-hidden border border-white/10 bg-[#121217]/85 backdrop-blur-xl shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-5 md:px-6 md:py-4">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3.5 w-32" />
                </div>
                <div className="divide-y divide-white/10">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-5 md:px-6 md:py-4">
                      <Skeleton className="size-10 md:size-11 rounded-2xl shrink-0" />
                      <div className="flex-1 space-y-1.5 min-w-0">
                        <Skeleton className="h-4 w-44" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : filtered.length > 0 ? (
              <Card className="overflow-hidden border border-white/10 bg-[#121217]/85 backdrop-blur-xl shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-5 md:px-6 md:py-4">
                  <p className="text-[0.8rem] font-semibold text-white">Daftar Setoran</p>
                  <span className="text-[0.72rem] text-zinc-400">
                    {filtered.length} data · {range === "today" ? "Hari ini" : range === "7d" ? "7 Hari" : range === "30d" ? "30 Hari" : "Semua"}
                  </span>
                </div>
                <div className="divide-y divide-white/10">
                  {filtered.map((record, index) => (
                    <DepositRow key={record.id} record={record} index={index} />
                  ))}
                </div>
              </Card>
            ) : (
              <EmptyState
                icon={<Mail className="size-6 text-sky-400" aria-hidden="true" />}
                title="Tidak ada setoran"
                description="Belum ada setoran pada periode ini."
                action={
                  <Link
                    href="/setor"
                    className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-400 via-sky-500 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-sky-500/25 hover:from-sky-300 hover:to-blue-500 transition-all active:scale-95"
                  >
                    Setor Sekarang
                  </Link>
                }
              />
            )}
          </Reveal>

          {/* See all */}
          {filtered.length > 0 && (
            <Reveal delay={240} className="mt-4">
              <button
                type="button"
                onClick={() => setRange("30d")}
                className="flex w-full items-center justify-center gap-1 rounded-2xl py-2.5 text-[0.78rem] font-semibold text-sky-400 transition-colors duration-300 hover:bg-sky-500/10 hover:text-sky-300 cursor-pointer"
              >
                Muat lebih banyak
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </button>
            </Reveal>
          )}
        </div>
      </div>
    </PageShell>
  );
}
