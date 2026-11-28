import { createClient } from "@supabase/supabase-js";
import {
  type UserProfile,
  type DepositRecord,
  type WithdrawalRecord,
  type TransactionRecord,
  type ReportTicket,
} from "./mock-data";
import {
  sanitizeInputText,
  sanitizeExternalUrl,
  isValidStrictGmail,
  checkRateLimit,
  validateEWalletNumber,
  sanitizeErrorMessage,
  recordWithdrawalAttempt,
} from "./security";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kdjoeeehyahdgwgsfyal.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith("https://") &&
    !supabaseUrl.includes("<")
);

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey || "placeholder-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

/* ------------------------------------------------------------------ */
/* Auth & Session Helpers (A01 & A07)                                 */
/* ------------------------------------------------------------------ */

export async function getCurrentAuthUser() {
  if (!isSupabaseConfigured) return null;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user) {
      return sessionData.session.user;
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

const defaultEmptyProfile: UserProfile = {
  name: "Pengguna",
  email: "-",
  uid: "-",
  role: "User",
  danaNumber: "-",
  joinedAt: "-",
  whatsappChannelUrl: "https://whatsapp.com/channel/0029VbEImqX7j6gFzKU9Qy1Y",
};

/* ------------------------------------------------------------------ */
/* 1. Profile & Settings Helpers (A01, A03, A07)                      */
/* ------------------------------------------------------------------ */

export async function fetchUserProfile(userId?: string): Promise<{
  profile: UserProfile;
  isFallback: boolean;
}> {
  try {
    const user = await getCurrentAuthUser();
    if (!user) {
      return { profile: defaultEmptyProfile, isFallback: true };
    }

    // A01/A07: Prevent IDOR - User A cannot access User B's profile
    if (userId && userId !== user.id) {
      console.warn(`[SECURITY] IDOR blocked: user ${user.id} attempted to view profile ${userId}`);
      return { profile: defaultEmptyProfile, isFallback: true };
    }

    const targetUid = user.id;
    let profileData: Record<string, any> | null = null;

    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", targetUid)
        .maybeSingle();
      profileData = data;
    }

    const realName =
      profileData?.name ||
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.email?.split("@")[0] ||
      "Pengguna";
    const realEmail = profileData?.email || user?.email || "-";
    const realDate = profileData?.created_at || user?.created_at;

    const profile: UserProfile = {
      uid: targetUid,
      name: realName,
      email: realEmail,
      role: (profileData?.role as UserProfile["role"]) || "User",
      avatarUrl: profileData?.avatar_url || user?.user_metadata?.avatar_url || undefined,
      whatsappChannelUrl:
        profileData?.whatsapp_channel_url || "https://whatsapp.com/channel/0029VbEImqX7j6gFzKU9Qy1Y",
      danaNumber: profileData?.dana_number || "-",
      joinedAt: realDate
        ? new Date(realDate).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "-",
    };

    return { profile, isFallback: false };
  } catch (err) {
    console.error("[PROFILE FETCH ERROR]", err);
    return { profile: defaultEmptyProfile, isFallback: true };
  }
}

export async function updateUserProfile(
  userId: string,
  updates: {
    name?: string;
    avatar_url?: string;
    dana_number?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { success: true };
  try {
    const user = await getCurrentAuthUser();
    // A01/A07: Verify authenticated session and ownership
    if (!user || user.id !== userId) {
      return { success: false, error: "Akses ditolak: Sesi tidak sah." };
    }

    // A03: Strict Input Sanitization
    const sanitizedUpdates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) {
      sanitizedUpdates.name = sanitizeInputText(updates.name, 100);
    }
    if (updates.avatar_url !== undefined) {
      sanitizedUpdates.avatar_url = sanitizeInputText(updates.avatar_url, 500);
    }
    if (updates.dana_number !== undefined) {
      const phoneVal = validateEWalletNumber(updates.dana_number);
      if (!phoneVal.valid) {
        return { success: false, error: phoneVal.error };
      }
      sanitizedUpdates.dana_number = phoneVal.cleaned;
    }

    const { error } = await supabase
      .from("profiles")
      .update(sanitizedUpdates)
      .eq("id", user.id);

    if (error) return { success: false, error: sanitizeErrorMessage(error) };
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: sanitizeErrorMessage(err) };
  }
}

/* ------------------------------------------------------------------ */
/* 2. Wallet & E-Wallet Helpers (A01, A03, A07)                       */
/* ------------------------------------------------------------------ */

export async function fetchUserWallet(userId?: string): Promise<{
  balance: number;
  minimumWithdrawal: number;
  danaNumber: string;
  isFallback: boolean;
}> {
  try {
    const user = await getCurrentAuthUser();
    if (!user) {
      return {
        balance: 0,
        minimumWithdrawal: 5000,
        danaNumber: "",
        isFallback: true,
      };
    }

    // A01/A07: Prevent IDOR
    if (userId && userId !== user.id) {
      console.warn(`[SECURITY] IDOR blocked: user ${user.id} attempted to view wallet ${userId}`);
      return {
        balance: 0,
        minimumWithdrawal: 5000,
        danaNumber: "",
        isFallback: true,
      };
    }

    const targetUid = user.id;
    let walletBalance = 0;
    let minWithdrawal = 5000;
    let danaNum = "";

    if (isSupabaseConfigured) {
      const { data: walletData } = await supabase
        .from("wallets")
        .select("balance, minimum_withdrawal")
        .eq("user_id", targetUid)
        .maybeSingle();

      const { data: profileData } = await supabase
        .from("profiles")
        .select("dana_number")
        .eq("id", targetUid)
        .maybeSingle();

      if (walletData) {
        walletBalance = Number(walletData.balance) || 0;
        minWithdrawal = Number(walletData.minimum_withdrawal) || 5000;
      }
      if (profileData?.dana_number) {
        danaNum = profileData.dana_number;
      }
    }

    return {
      balance: walletBalance,
      minimumWithdrawal: minWithdrawal,
      danaNumber: danaNum,
      isFallback: false,
    };
  } catch (err) {
    console.error("[WALLET FETCH ERROR]", err);
    return {
      balance: 0,
      minimumWithdrawal: 5000,
      danaNumber: "",
      isFallback: true,
    };
  }
}

/* ------------------------------------------------------------------ */
/* 3. Deposits / Setoran Helpers (A01, A03, A07)                      */
/* ------------------------------------------------------------------ */

export async function fetchUserDeposits(userId?: string): Promise<{
  deposits: DepositRecord[];
  isFallback: boolean;
}> {
  try {
    const user = await getCurrentAuthUser();
    if (!user) {
      return { deposits: [], isFallback: true };
    }

    // A01/A07: Prevent IDOR
    if (userId && userId !== user.id) {
      console.warn(`[SECURITY] IDOR blocked: user ${user.id} attempted to view deposits ${userId}`);
      return { deposits: [], isFallback: true };
    }

    const targetUid = user.id;

    if (!isSupabaseConfigured) {
      return { deposits: [], isFallback: true };
    }

    const { data, error } = await supabase
      .from("deposits")
      .select("id, gmail, status, amount, category_id, note, created_at, updated_at")
      .eq("user_id", targetUid)
      .order("created_at", { ascending: false });

    if (error) {
      return { deposits: [], isFallback: true };
    }

    const deposits: DepositRecord[] = (data || []).map((d) => ({
      id: d.id,
      gmail: d.gmail,
      status: d.status as DepositRecord["status"],
      amount: d.amount,
      category: (d.category_id as DepositRecord["category"]) || "good",
      createdAt: d.created_at,
      updatedAt: d.updated_at || undefined,
      note: d.note || undefined,
    }));

    return { deposits, isFallback: false };
  } catch (err) {
    console.error("[DEPOSITS FETCH ERROR]", err);
    return { deposits: [], isFallback: true };
  }
}

export async function insertUserDeposits(
  userId: string,
  emails: string[],
  categoryId = "good",
  _amountPerAccount = 1500,
  note?: string,
  password?: string,
  items?: Array<{ email: string; password?: string; totp_secret?: string }>,
  contactInfo?: string
): Promise<{ success: boolean; insertedCount: number; insertedIds?: string[]; error?: string }> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      insertedCount: 0,
      error: "Konfigurasi database belum aktif.",
    };
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user || (await getCurrentAuthUser());

    if (!user || user.id !== userId || !session?.access_token) {
      return { success: false, insertedCount: 0, error: "Akses ditolak: Sesi tidak sah." };
    }

    const rate = checkRateLimit(`deposit:${user.id}`, 6, 60000);
    if (!rate.allowed) {
      return {
        success: false,
        insertedCount: 0,
        error: "Terlalu banyak permintaan setor dalam waktu singkat. Mohon tunggu sebentar.",
      };
    }

    const normalizedItems: Array<{ email: string; password: string; totp_secret?: string }> =
      Array.isArray(items) && items.length > 0
        ? items
            .filter((it) => isValidStrictGmail(it?.email))
            .map((it) => ({
              email: it.email.trim().toLowerCase(),
              password: sanitizeInputText(it.password || "", 120),
              ...(it.totp_secret
                ? { totp_secret: sanitizeInputText(it.totp_secret, 128).toUpperCase() }
                : {}),
            }))
        : (emails || [])
            .filter((e) => isValidStrictGmail(e))
            .map((e) => ({
              email: e.trim().toLowerCase(),
              password: sanitizeInputText(password || "", 120),
            }));

    if (normalizedItems.length === 0) {
      return { success: false, insertedCount: 0, error: "Tidak ada email Gmail valid untuk disetor." };
    }

    if (normalizedItems.length > 10) {
      return { success: false, insertedCount: 0, error: "Maksimal 10 Gmail per pengiriman setoran." };
    }

    const res = await fetch("/api/user/deposits", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        emails: normalizedItems.map((it) => it.email),
        items: normalizedItems,
        categoryId: categoryId === "bebas" ? "bebas" : "good",
        password: password ? sanitizeInputText(password, 120) : undefined,
        note: note ? sanitizeInputText(note, 200) : undefined,
        contact_info: contactInfo ? sanitizeInputText(contactInfo, 100) : undefined,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) {
      return {
        success: false,
        insertedCount: 0,
        error: json?.error || "Gagal menyimpan data setoran.",
      };
    }

    return {
      success: true,
      insertedCount: Number(json.insertedCount) || normalizedItems.length,
      insertedIds: Array.isArray(json.insertedIds) ? json.insertedIds : [],
    };
  } catch (err: unknown) {
    return {
      success: false,
      insertedCount: 0,
      error: sanitizeErrorMessage(err, "Gagal menyimpan data setoran."),
    };
  }
}

export async function updateUserDepositsContact(
  depositIds: string[],
  contactInfo: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { success: true };
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { success: false, error: "Sesi login tidak ditemukan." };
    }

    const cleanContact = sanitizeInputText(contactInfo, 100);
    if (!cleanContact) {
      return { success: false, error: "Kontak tidak boleh kosong." };
    }

    const res = await fetch("/api/user/deposits", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        depositIds: Array.isArray(depositIds) ? depositIds.slice(0, 15) : [],
        contact_info: cleanContact,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) {
      return {
        success: false,
        error: json?.error || "Gagal menyimpan kontak tindak lanjut.",
      };
    }
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: sanitizeErrorMessage(err, "Gagal menyimpan kontak tindak lanjut."),
    };
  }
}

/* ------------------------------------------------------------------ */
/* 4. Withdrawals / Penarikan Helpers (A01, A03, A04, A07, A09, B1)   */
/* ------------------------------------------------------------------ */

export async function fetchUserWithdrawals(userId?: string): Promise<{
  withdrawals: WithdrawalRecord[];
  isFallback: boolean;
}> {
  try {
    const user = await getCurrentAuthUser();
    if (!user) {
      return { withdrawals: [], isFallback: true };
    }

    // A01/A07: Prevent IDOR
    if (userId && userId !== user.id) {
      console.warn(`[SECURITY] IDOR blocked: user ${user.id} attempted to view withdrawals ${userId}`);
      return { withdrawals: [], isFallback: true };
    }

    const targetUid = user.id;

    if (!isSupabaseConfigured) {
      return { withdrawals: [], isFallback: true };
    }

    const { data, error } = await supabase
      .from("withdrawals")
      .select("id, amount, status, method, account_number, account_name, created_at, updated_at")
      .eq("user_id", targetUid)
      .order("created_at", { ascending: false });

    if (error) {
      return { withdrawals: [], isFallback: true };
    }

    const withdrawals: WithdrawalRecord[] = (data || []).map((w) => ({
      id: w.id,
      amount: Number(w.amount),
      status: w.status as WithdrawalRecord["status"],
      method: w.method,
      accountNumber: w.account_number,
      accountName: w.account_name || undefined,
      createdAt: w.created_at,
      updatedAt: w.updated_at || undefined,
    }));

    return { withdrawals, isFallback: false };
  } catch (err) {
    console.error("[WITHDRAWALS FETCH ERROR]", err);
    return { withdrawals: [], isFallback: true };
  }
}

export interface DanaInquiryClientResult {
  success: boolean;
  customerName?: string;
  customerNumber?: string;
  accountNumber?: string;
  amount?: number;
  taxFee?: number;
  netAmount?: number;
  maxAmount?: number;
  autoDisburse?: boolean;
  autoDisburseMaxAmount?: number;
  env?: string;
  error?: string;
}

export async function inquireUserDanaAccount(params: {
  accountNumber: string;
  amount: number;
}): Promise<DanaInquiryClientResult> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { success: false, error: "Sesi login tidak ditemukan. Silakan login ulang." };
    }

    const phoneCheck = validateEWalletNumber(params.accountNumber);
    if (!phoneCheck.valid) {
      return { success: false, error: phoneCheck.error || "Nomor DANA tidak valid." };
    }

    const res = await fetch("/api/user/withdrawals/inquiry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        accountNumber: phoneCheck.cleaned,
        amount: params.amount,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) {
      return {
        success: false,
        error: json?.error || "Gagal memeriksa nomor DANA tujuan.",
      };
    }

    return {
      success: true,
      customerName: json.customerName,
      customerNumber: json.customerNumber,
      accountNumber: json.accountNumber,
      amount: json.amount,
      taxFee: json.taxFee,
      netAmount: json.netAmount,
      maxAmount: json.maxAmount,
      autoDisburse: Boolean(json.autoDisburse),
      autoDisburseMaxAmount: json.autoDisburseMaxAmount,
      env: json.env,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: sanitizeErrorMessage(err, "Gagal memeriksa nomor DANA tujuan."),
    };
  }
}

export async function insertWithdrawalRequest(
  userId: string,
  params: {
    amount: number;
    taxFee: number;
    netAmount: number;
    method: string;
    accountNumber: string;
  }
): Promise<{
  success: boolean;
  id?: string;
  status?: string;
  autoDisbursed?: boolean;
  requiresAdminApproval?: boolean;
  pendingDanaConfirm?: boolean;
  customerName?: string;
  referenceNo?: string;
  error?: string;
}> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user || (await getCurrentAuthUser());
    if (!user || user.id !== userId) {
      return { success: false, error: "Akses ditolak: Sesi tidak sah." };
    }

    const cleanMethod = sanitizeInputText(params.method, 20).toUpperCase();
    if (cleanMethod !== "DANA") {
      recordWithdrawalAttempt(user.id, false);
      return { success: false, error: "Saat ini penarikan saldo hanya mendukung metode DANA." };
    }

    const phoneCheck = validateEWalletNumber(params.accountNumber);
    if (!phoneCheck.valid) {
      recordWithdrawalAttempt(user.id, false);
      return { success: false, error: phoneCheck.error };
    }

    if (!isSupabaseConfigured) {
      recordWithdrawalAttempt(user.id, true);
      return { success: true, id: `w-${Date.now()}` };
    }

    if (!session?.access_token) {
      return { success: false, error: "Akses ditolak: Token sesi tidak ditemukan." };
    }

    const res = await fetch("/api/user/withdrawals", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        amount: params.amount,
        method: "DANA",
        accountNumber: phoneCheck.cleaned,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) {
      recordWithdrawalAttempt(user.id, false);
      return {
        success: false,
        error: json?.error || "Gagal memproses penarikan saldo.",
      };
    }

    recordWithdrawalAttempt(user.id, true);
    return {
      success: true,
      id: json.id,
      status: json.status,
      autoDisbursed: Boolean(json.autoDisbursed),
      requiresAdminApproval: Boolean(json.requiresAdminApproval),
      pendingDanaConfirm: Boolean(json.pendingDanaConfirm),
      customerName: json.customerName,
      referenceNo: json.referenceNo,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: sanitizeErrorMessage(err, "Gagal memproses penarikan saldo."),
    };
  }
}

/* ------------------------------------------------------------------ */
/* 5. Transactions / Mutasi Helpers (A01, A07)                        */
/* ------------------------------------------------------------------ */

export async function fetchUserTransactions(userId?: string): Promise<{
  transactions: TransactionRecord[];
  isFallback: boolean;
}> {
  try {
    const user = await getCurrentAuthUser();
    if (!user) {
      return { transactions: [], isFallback: true };
    }

    // A01/A07: Prevent IDOR
    if (userId && userId !== user.id) {
      console.warn(`[SECURITY] IDOR blocked: user ${user.id} attempted to view transactions ${userId}`);
      return { transactions: [], isFallback: true };
    }

    const targetUid = user.id;

    if (!isSupabaseConfigured) {
      return { transactions: [], isFallback: true };
    }

    const { data, error } = await supabase
      .from("transactions")
      .select("id, type, amount, title, description, status, created_at")
      .eq("user_id", targetUid)
      .order("created_at", { ascending: false });

    if (error) {
      return { transactions: [], isFallback: true };
    }

    const transactions: TransactionRecord[] = (data || []).map((t) => ({
      id: t.id,
      type: t.type as TransactionRecord["type"],
      amount: Number(t.amount),
      title: t.title,
      description: t.description || "",
      status: t.status as TransactionRecord["status"],
      createdAt: t.created_at,
    }));

    return { transactions, isFallback: false };
  } catch (err) {
    console.error("[TRANSACTIONS FETCH ERROR]", err);
    return { transactions: [], isFallback: true };
  }
}

/* ------------------------------------------------------------------ */
/* 6. Support Tickets / Laporan Helpers                               */
/* Note: Laporan sekarang 100% direct ke Telegram Admin @winterhere   */
/* ------------------------------------------------------------------ */

export async function fetchUserTickets(_userId?: string): Promise<{
  tickets: ReportTicket[];
  isFallback: boolean;
}> {
  return { tickets: [], isFallback: false };
}

export async function insertSupportTicket(
  _userId: string,
  params: {
    code: string;
    category: string;
    subject: string;
    description: string;
    attachmentName?: string;
    attachmentUrl?: string;
  }
): Promise<{ success: boolean; id?: string; error?: string }> {
  // Laporan diarahkan langsung ke Telegram admin @winterhere
  return { success: true, id: params.code || `t-${Date.now()}` };
}

/* ------------------------------------------------------------------ */
/* 7. CMS Site Configuration Helpers                                  */
/* ------------------------------------------------------------------ */

export interface SiteConfig {
  price_per_gmail: number;
  price_bebas: number;
  min_withdrawal: number;
  max_withdrawals_per_day: number;
  is_gopay_active: boolean;
  is_ovo_active: boolean;
  is_dana_active: boolean;
  is_shopeepay_active: boolean;
  tax_gopay_active: boolean;
  tax_gopay: number;
  tax_ovo_active: boolean;
  tax_ovo: number;
  tax_dana_active: boolean;
  tax_dana: number;
  tax_shopeepay_active: boolean;
  tax_shopeepay: number;
  default_password: string;
  rule_status: string;
  rule_nama: string;
  rule_usia: string;
  rule_keamanan: string;
  rules_detail_text: string[];
  hero_headline_1: string;
  hero_headline_2: string;
  hero_headline_3: string;
  hero_subheadline: string;
  platform_badge: string;
  badge_status_text: string;
  badge_status_active: boolean;
  landing_video_url: string;
  marquee_text: string;
  whatsapp_channel_url: string;
  telegram_admin_username: string;
  is_setor_active: boolean;
  is_checker_active: boolean;
  is_withdrawal_active: boolean;
  is_maintenance_mode: boolean;
  maintenance_message: string;
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  price_per_gmail: 1500,
  price_bebas: 1000,
  min_withdrawal: 5000,
  max_withdrawals_per_day: 3,
  is_gopay_active: false,
  is_ovo_active: false,
  is_dana_active: true,
  is_shopeepay_active: false,
  tax_gopay_active: true,
  tax_gopay: 1000,
  tax_ovo_active: true,
  tax_ovo: 1000,
  tax_dana_active: false,
  tax_dana: 0,
  tax_shopeepay_active: false,
  tax_shopeepay: 0,
  default_password: "winter1212",
  rule_status: "Wajib Fresh (baru dibuat)",
  rule_nama: "Wajib sama persis hasil generate",
  rule_usia: "Lahir 21+ tahun",
  rule_keamanan: "Tanpa No HP / Email Pemulihan",
  rules_detail_text: [
    "Wajib Fresh: Akun harus baru dibuat secara manual.",
    "Nama Akun Sama Persis: Huruf dan angka pada Gmail wajib sama dengan hasil yang di-generate.",
    "Usia 21+ Tahun: Atur tanggal dan tahun kelahiran akun Gmail di Google agar umur akun minimal 21 tahun (contoh: tahun 2000–2004).",
    "Tanpa Pemulihan: Akun dilarang menautkan nomor HP pemulihan atau email pemulihan agar peninjauan oleh admin lancar tanpa kendala OTP.",
  ],
  hero_headline_1: "Ubah Akun",
  hero_headline_2: "Gmail Jadi",
  hero_headline_3: "Penghasilan",
  hero_subheadline:
    "Setor Gmail dan dapatkan saldo\nPencairan instan via DANA",
  platform_badge: "Platform Setor Gmail Terpercaya 2026",
  badge_status_text: "Platform sedang dalam tahap pengembangan",
  badge_status_active: true,
  landing_video_url: "/cara-kerja.mp4",
  marquee_text:
    "PROSES CEPAT • AMAN TERPERCAYA • PENCAIRAN INSTAN • SETOR SEKARANG •",
  whatsapp_channel_url:
    "https://whatsapp.com/channel/0029VbEImqX7j6gFzKU9Qy1Y",
  telegram_admin_username: "winterhere",
  is_setor_active: true,
  is_checker_active: true,
  is_withdrawal_active: true,
  is_maintenance_mode: false,
  maintenance_message:
    "Platform sedang dalam pemeliharaan berkala untuk peningkatan sistem. Mohon kembali beberapa saat lagi.",
};

function hardenSiteConfig(raw: Record<string, any> | null | undefined): SiteConfig {
  const merged = { ...DEFAULT_SITE_CONFIG, ...(raw || {}) };
  const rawMaxDaily = Number(merged.max_withdrawals_per_day);
  merged.max_withdrawals_per_day = Number.isFinite(rawMaxDaily) && rawMaxDaily >= 1
    ? Math.min(50, Math.floor(rawMaxDaily))
    : DEFAULT_SITE_CONFIG.max_withdrawals_per_day;
  merged.whatsapp_channel_url = sanitizeExternalUrl(
    merged.whatsapp_channel_url,
    DEFAULT_SITE_CONFIG.whatsapp_channel_url,
    ["whatsapp.com", "wa.me"]
  );
  merged.telegram_admin_username =
    sanitizeInputText(merged.telegram_admin_username, 40).replace(/[^a-zA-Z0-9_]/g, "") ||
    DEFAULT_SITE_CONFIG.telegram_admin_username;
  return merged;
}

export function getCachedSiteConfig(): SiteConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem("setorgmail_cached_site_config_v1");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === "object") {
        return hardenSiteConfig(parsed);
      }
    }
  } catch {}
  return null;
}

export async function fetchSiteConfig(): Promise<SiteConfig> {
  // 1. Always fetch authoritative fresh config from server endpoint (no-store) first on browser
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/site-config", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.success && json?.config && typeof json.config === "object") {
          const merged = hardenSiteConfig(json.config);
          try {
            localStorage.setItem("setorgmail_cached_site_config_v1", JSON.stringify(merged));
          } catch {}
          return merged;
        }
      }
    } catch {}
  }

  // 2. Fallback direct query to Supabase app_settings
  if (isSupabaseConfigured) {
    try {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "site_config")
        .maybeSingle();

      if (data?.value) {
        const fresh =
          typeof data.value === "string" ? JSON.parse(data.value) : data.value;
        const merged = hardenSiteConfig(fresh);
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(
              "setorgmail_cached_site_config_v1",
              JSON.stringify(merged)
            );
          } catch {}
        }
        return merged;
      }
    } catch {}
  }

  return getCachedSiteConfig() || DEFAULT_SITE_CONFIG;
}

