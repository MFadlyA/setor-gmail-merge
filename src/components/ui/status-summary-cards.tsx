'use client';

import { Inbox, CheckCircle2, Clock, XCircle, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export interface StatusCardItem {
  id?: string;
  title: string;
  value: number | string;
  bg: string;
  svgType?: 'circles' | 'blur2' | 'blur3' | 'blur4';
}

export function StatusSummaryCardItem({
  item,
  index,
  totalItems = 4,
}: {
  item: StatusCardItem;
  index: number;
  totalItems?: number;
}) {
  const titleLower = item.title.toLowerCase();
  const theme = titleLower.includes('terima')
    ? {
        wrapper:
          'bg-gradient-to-br from-emerald-950/50 via-[#12151e]/92 to-[#0a0c12]/95 border-emerald-500/30 hover:border-emerald-400/60 shadow-lg shadow-emerald-950/25',
        topBar: 'via-emerald-400/70',
        title: 'text-emerald-200/90',
        value: 'text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.3)]',
        iconWrap: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
        Icon: CheckCircle2,
      }
    : titleLower.includes('cek') || titleLower.includes('proses') || titleLower.includes('pending')
    ? {
        wrapper:
          'bg-gradient-to-br from-sky-950/50 via-[#12151e]/92 to-[#0a0c12]/95 border-sky-500/30 hover:border-sky-400/60 shadow-lg shadow-sky-950/25',
        topBar: 'via-sky-400/70',
        title: 'text-sky-200/90',
        value: 'text-sky-400 drop-shadow-[0_0_12px_rgba(56,189,248,0.3)]',
        iconWrap: 'bg-sky-500/15 border-sky-500/30 text-sky-400',
        Icon: Clock,
      }
    : titleLower.includes('tindakan') || titleLower.includes('masalah') || titleLower.includes('kendala')
    ? {
        wrapper:
          'bg-gradient-to-br from-amber-950/50 via-[#12151e]/92 to-[#0a0c12]/95 border-amber-500/30 hover:border-amber-400/60 shadow-lg shadow-amber-950/25',
        topBar: 'via-amber-400/70',
        title: 'text-amber-200/90',
        value: 'text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.3)]',
        iconWrap: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
        Icon: AlertTriangle,
      }
    : titleLower.includes('tolak') || titleLower.includes('gagal')
    ? {
        wrapper:
          'bg-gradient-to-br from-rose-950/50 via-[#12151e]/92 to-[#0a0c12]/95 border-rose-500/30 hover:border-rose-400/60 shadow-lg shadow-rose-950/25',
        topBar: 'via-rose-400/70',
        title: 'text-rose-200/90',
        value: 'text-rose-400 drop-shadow-[0_0_12px_rgba(251,113,133,0.3)]',
        iconWrap: 'bg-rose-500/15 border-rose-500/30 text-rose-400',
        Icon: XCircle,
      }
    : {
        wrapper:
          'bg-gradient-to-br from-zinc-800/45 via-[#131520]/92 to-[#0b0d14]/95 border-white/12 hover:border-white/25 shadow-lg',
        topBar: 'via-white/40',
        title: 'text-zinc-300',
        value: 'text-white',
        iconWrap: 'bg-white/10 border-white/15 text-zinc-200',
        Icon: Inbox,
      };

  const StatusIcon = theme.Icon;
  const spanFirstOnMobile = totalItems === 5 && index === 0 ? 'col-span-2 sm:col-span-1' : '';

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border p-4 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl ${theme.wrapper} ${spanFirstOnMobile}`}
    >
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent ${theme.topBar} to-transparent`}
      />
      <div className="relative z-10 flex flex-col justify-between h-full">
        <div className="flex items-center justify-between gap-2">
          <p className={`text-xs sm:text-[0.8rem] font-bold tracking-tight ${theme.title}`}>
            {item.title}
          </p>
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-110 ${theme.iconWrap}`}
          >
            <StatusIcon className="size-3.5" aria-hidden="true" />
          </span>
        </div>
        <div className="mt-2.5">
          <span className={`text-2xl sm:text-3xl font-black tracking-tight tabular-nums ${theme.value}`}>
            {item.value}
          </span>
        </div>
      </div>
    </div>
  );
}

export function StatusSummaryCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 shadow-xs"
        >
          <Skeleton className="h-3.5 w-20" />
          <div className="mt-3">
            <Skeleton className="h-8 w-14" />
          </div>
        </div>
      ))}
    </>
  );
}

export function StatusSummaryGrid({
  items,
  isLoading,
}: {
  items: StatusCardItem[];
  isLoading?: boolean;
}) {
  const gridColsClass =
    items.length === 5
      ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
      : 'grid-cols-2 sm:grid-cols-4';

  return (
    <div className={`mt-3.5 grid gap-3 ${gridColsClass}`}>
      {isLoading ? (
        <StatusSummaryCardsSkeleton count={items.length || 4} />
      ) : (
        items.map((item, index) => (
          <StatusSummaryCardItem
            key={item.title}
            item={item}
            index={index}
            totalItems={items.length}
          />
        ))
      )}
    </div>
  );
}
