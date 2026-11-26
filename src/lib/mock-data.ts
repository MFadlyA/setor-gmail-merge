export type UserProfile = {
  name: string;
  email: string;
  uid: string;
  role: "User" | "Admin" | "Reseller";
  avatarUrl?: string;
  whatsappChannelUrl?: string;
  danaNumber?: string;
  joinedAt?: string;
  passwordChangedAt?: string;
};

export const mockUser: UserProfile = {
  name: "Pengguna",
  email: "-",
  uid: "-",
  role: "User",
  danaNumber: "-",
  joinedAt: "-",
  passwordChangedAt: "Belum pernah",
  whatsappChannelUrl: "https://whatsapp.com/channel/0029VbEImqX7j6gFzKU9Qy1Y",
};

export type SetorCategory = {
  id: "good" | "captcha" | "bebas";
  label: string;
  price: number;
  description: string;
  badge?: string;
  disabled?: boolean;
};

export const setorCategories: SetorCategory[] = [
  {
    id: "good",
    label: "Setor Gmail Good",
    price: 4500,
    description: "Untuk Gmail dengan status Good",
    badge: "Rekomendasi",
  },
  {
    id: "bebas",
    label: "Setor Gmail Bebas",
    price: 2500,
    description: "Format bebas, fleksibel untuk semua kebutuhan",
    disabled: false,
  },
];

export const defaultPassword = "winter1212";

export const rulesBannerText = "Cek Rules dulu sebelum setor";

export const statusConfig = {
  diterima: { label: "Diterima", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  pending: { label: "Di Cek", className: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  dicek: { label: "Di Cek", className: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  ditolak: { label: "Ditolak", className: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
  need_2fa: { label: "Butuh 2FA", className: "bg-amber-500/10 text-amber-400 border-amber-500/25" },
  need_phone_verify: {
    label: "Butuh Verifikasi HP",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  },
  captcha_checkpoint: {
    label: "Terkena Captcha",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  },
  unknown: { label: "Tidak Diketahui", className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30" },
  semua: { label: "Semua", className: "" },
} as const;

export type DepositStatus = keyof typeof statusConfig;

export const ACCEPTED_DEPOSIT_STATUSES = ["diterima", "accepted", "sukses", "approved"] as const;
export const PENDING_DEPOSIT_STATUSES = ["pending", "dicek", "proses", "menunggu"] as const;
export const REJECTED_DEPOSIT_STATUSES = ["ditolak", "rejected", "batal"] as const;
export const ISSUE_DEPOSIT_STATUSES = [
  "need_2fa",
  "need_phone_verify",
  "captcha_checkpoint",
  "unknown",
] as const;

export function isAcceptedDepositStatus(status?: string | null): boolean {
  const s = (status || "").toLowerCase().trim();
  return (ACCEPTED_DEPOSIT_STATUSES as readonly string[]).includes(s);
}

export function isPendingDepositStatus(status?: string | null): boolean {
  const s = (status || "").toLowerCase().trim();
  return (PENDING_DEPOSIT_STATUSES as readonly string[]).includes(s);
}

export function isRejectedDepositStatus(status?: string | null): boolean {
  const s = (status || "").toLowerCase().trim();
  return (REJECTED_DEPOSIT_STATUSES as readonly string[]).includes(s);
}

/**
 * Matches the 4 checker issue statuses AND acts as a safe catch-all bucket for any
 * unrecognized status string so total === diterima + pending + bermasalah + ditolak.
 */
export function isIssueDepositStatus(status?: string | null): boolean {
  const s = (status || "").toLowerCase().trim();
  if ((ISSUE_DEPOSIT_STATUSES as readonly string[]).includes(s)) return true;
  if (!s) return true;
  return (
    !isAcceptedDepositStatus(s) &&
    !isPendingDepositStatus(s) &&
    !isRejectedDepositStatus(s)
  );
}

export function getDepositStatusAdminMeta(status?: string | null): {
  label: string;
  badgeClass: string;
  dotClass: string;
} {
  const s = (status || "").toLowerCase().trim();
  if (isAcceptedDepositStatus(s)) {
    return {
      label: "Diterima",
      badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      dotClass: "bg-emerald-400",
    };
  }
  if (isPendingDepositStatus(s)) {
    return {
      label: "Menunggu Cek",
      badgeClass: "bg-sky-500/10 text-sky-400 border-sky-500/20",
      dotClass: "bg-sky-400 animate-pulse",
    };
  }
  if (isRejectedDepositStatus(s)) {
    return {
      label: "Ditolak",
      badgeClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      dotClass: "bg-rose-400",
    };
  }
  if (s === "need_2fa") {
    return {
      label: "Butuh 2FA",
      badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/25",
      dotClass: "bg-amber-400",
    };
  }
  if (s === "need_phone_verify") {
    return {
      label: "Butuh Verifikasi HP",
      badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/25",
      dotClass: "bg-amber-400",
    };
  }
  if (s === "captcha_checkpoint") {
    return {
      label: "Terkena Captcha",
      badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/25",
      dotClass: "bg-amber-400",
    };
  }
  if (s === "unknown") {
    return {
      label: "Tidak Diketahui",
      badgeClass: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
      dotClass: "bg-zinc-400",
    };
  }
  return {
    label: "Tidak Diketahui",
    badgeClass: "bg-amber-500/10 text-amber-300 border-amber-500/25",
    dotClass: "bg-amber-400",
  };
}

export type DepositRecord = {
  id: string;
  gmail: string;
  status: Exclude<DepositStatus, "semua"> | (string & {});
  amount: number;
  category: SetorCategory["id"];
  createdAt: string;
  updatedAt?: string;
  note?: string;
};

export const mockDeposits: DepositRecord[] = [];

export type WithdrawalStatus = "diproses" | "berhasil" | "ditolak";

export type WithdrawalRecord = {
  id: string;
  amount: number;
  status: WithdrawalStatus;
  method: "DANA" | "OVO" | "GOPAY" | "SHOPEEPAY" | string;
  accountNumber: string;
  createdAt: string;
  updatedAt?: string;
};

export type TransactionRecord = {
  id: string;
  type: "deposit" | "withdrawal" | "bonus";
  amount: number;
  title: string;
  description: string;
  createdAt: string;
  status: "success" | "pending" | "failed";
};

export const mockWallet = {
  balance: 0,
  minimumWithdrawal: 5000,
  danaNumber: "",
};

export const mockWithdrawals: WithdrawalRecord[] = [];

export const mockTransactions: TransactionRecord[] = [];

export type QuickMenuIconName =
  | "send"
  | "scale"
  | "shield-check"
  | "file-text";

/** Either a link to a route, or an in-page action such as opening the rules. */
export type QuickMenuItem = {
  key: string;
  label: string;
  iconName: QuickMenuIconName;
} & ({ href: string; action?: undefined } | { action: "rules"; href?: undefined });

export const quickMenuItems: QuickMenuItem[] = [
  { key: "setor", label: "Setor", href: "/setor", iconName: "send" },
  { key: "checker", label: "Checker", href: "/checker", iconName: "shield-check" },
  { key: "laporan", label: "Laporan", href: "/laporan", iconName: "file-text" },
];

/* ------------------------------------------------------------------ */
/* Support reports (/laporan)                                          */
/* ------------------------------------------------------------------ */

/** First entry is the default selection in the "Buat Laporan" modal. */
export const reportCategories = [
  "Setoran Gmail",
  "Penarikan Saldo",
  "Bug / Error",
  "Saran & Masukan",
] as const;

export type ReportCategory = (typeof reportCategories)[number];

export type ReportStatus = "baru" | "diproses" | "selesai";

export type ReportReply = {
  id: string;
  from: "user" | "admin";
  body: string;
  createdAt: string;
};

export type ReportTicket = {
  id: string;
  code: string;
  subject: string;
  category: ReportCategory;
  description: string;
  status: ReportStatus;
  createdAt: string;
  attachmentName?: string;
  replies: ReportReply[];
};

/** Empty by design so the "Belum ada laporan" empty state shows on first load. */
export const mockReports: ReportTicket[] = [];

export const timeRanges = [
  { value: "today", label: "Hari ini" },
  { value: "7d", label: "7 Hari" },
  { value: "30d", label: "30 Hari" },
  { value: "all", label: "Semua" },
] as const;

export type TimeRange = (typeof timeRanges)[number]["value"];

export const summaryStats = {
  diterima: 0,
  pending: 0,
  ditolak: 0,
  harga: 4500,
};
