import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, fetchAllRows } from "@/lib/supabase/admin";
import { getAdminEmails } from "@/lib/auth-helpers";
import { requireAdminAuth } from "@/lib/security/auth-guard";

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response!;

  const startTime = Date.now();
  try {
    const searchParams = req.nextUrl.searchParams;
    const timeframe = (searchParams.get("timeframe") || "7D").toUpperCase();

    // Hitung tanggal batas (cutoff) berdasarkan filter hari
    let cutoffDate: Date | null = null;
    const now = new Date();
    if (timeframe === "1D") {
      cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (timeframe === "3D") {
      cutoffDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    } else if (timeframe === "7D") {
      cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeframe === "14D") {
      cutoffDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    } else if (timeframe === "30D") {
      cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (timeframe === "ALL") {
      cutoffDate = null;
    } else {
      cutoffDate = null;
    }

    // Parallel fetch: profiles, wallets, transactions, withdrawals, deposits, categories
    // Note: support_tickets diisolasi secara aman agar ketiadaan tabel tidak membuat stats crash (500)
    const [
      { data: profiles, error: pErr },
      { data: wallets, error: wErr },
      { data: transactions },
      { data: withdrawals },
      { data: deposits, error: depErr },
      { data: categories },
      { data: siteConfigRow },
    ] = await Promise.all([
      fetchAllRows((from, to) =>
        supabaseAdmin
          .from("profiles")
          .select("id, name, email, role, avatar_url, dana_number, created_at")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabaseAdmin
          .from("wallets")
          .select("user_id, balance, total_withdrawn, total_earned")
          .order("user_id", { ascending: true })
          .range(from, to)
      ),
      supabaseAdmin
        .from("transactions")
        .select("id, user_id, type, amount, title, description, status, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(200),
      fetchAllRows((from, to) =>
        supabaseAdmin
          .from("withdrawals")
          .select("id, user_id, amount, method, status, created_at, account_name, account_number")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabaseAdmin
          .from("deposits")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to)
      ),
      supabaseAdmin
        .from("setor_categories")
        .select("*"),
      supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", "site_config")
        .maybeSingle(),
    ]);

    let defaultPassword = "winter1212";
    let cfgPricePerGmail: number | null = null;
    try {
      if (siteConfigRow?.value) {
        const parsedCfg =
          typeof siteConfigRow.value === "string"
            ? JSON.parse(siteConfigRow.value)
            : siteConfigRow.value;
        if (parsedCfg?.default_password) defaultPassword = String(parsedCfg.default_password);
        if (Number(parsedCfg?.price_per_gmail) > 0) cfgPricePerGmail = Number(parsedCfg.price_per_gmail);
      }
    } catch {
      // keep defaults
    }

    if (pErr) throw pErr;
    if (wErr) throw wErr;

    const totalUsers = profiles?.length || 0;
    const totalAdmins =
      profiles?.filter((p) => (p.role || "").toLowerCase() === "admin").length || 0;
    const totalMembers = totalUsers - totalAdmins;

    const walletMap: Record<string, { balance: number; total_withdrawn: number; total_earned: number }> = {};
    let totalBalance = 0;
    let totalWithdrawnFromWallets = 0;
    let totalEarned = 0;
    let usersWithBalance = 0;
    let usersWithdrawnFromWallets = 0;

    (wallets || []).forEach((w) => {
      const b = Number(w.balance) || 0;
      const tw = Number(w.total_withdrawn) || 0;
      const te = Number(w.total_earned) || 0;
      walletMap[w.user_id] = { balance: b, total_withdrawn: tw, total_earned: te };
      totalBalance += b;
      totalWithdrawnFromWallets += tw;
      totalEarned += te;
      if (b > 0) usersWithBalance++;
      if (tw > 0) usersWithdrawnFromWallets++;
    });

    // Build user map for fast name/email resolution
    const userMap: Record<string, { name: string; email: string; dana: string; avatar_url?: string }> = {};
    (profiles || []).forEach((p) => {
      userMap[p.id] = {
        name: p.name || p.email?.split("@")[0] || "User",
        email: p.email || "-",
        dana: p.dana_number || "-",
        avatar_url: p.avatar_url,
      };
    });

    // Filter raw data sesuai timeframe yang dipilih (1D, 3D, 7D, 14D, 30D, All)
    const allDepositsRaw = deposits || [];
    const allWithdrawalsRaw = withdrawals || [];
    const allTransactionsRaw = transactions || [];

    const filteredDeposits = cutoffDate
      ? allDepositsRaw.filter((d) => new Date(d.created_at) >= cutoffDate)
      : allDepositsRaw;

    const filteredWithdrawals = cutoffDate
      ? allWithdrawalsRaw.filter((w) => new Date(w.created_at) >= cutoffDate)
      : allWithdrawalsRaw;

    const filteredTransactions = cutoffDate
      ? allTransactionsRaw.filter((t) => new Date(t.created_at) >= cutoffDate)
      : allTransactionsRaw;

    // Withdrawal metrics sesuai timeframe
    const successWithdrawals = filteredWithdrawals.filter((w) =>
      ["success", "berhasil"].includes((w.status || "").toLowerCase())
    );
    let totalWithdrawnInPeriod = 0;
    successWithdrawals.forEach((w) => {
      totalWithdrawnInPeriod += Number(w.amount) || 0;
    });
    const successWithdrawalUsers = new Set(successWithdrawals.map((w) => w.user_id));
    const totalWithdrawalTransactions = successWithdrawals.length;

    const totalWithdrawn = !cutoffDate
      ? Math.max(totalWithdrawnInPeriod, totalWithdrawnFromWallets)
      : totalWithdrawnInPeriod;

    const usersWithdrawnCount = !cutoffDate
      ? Math.max(successWithdrawalUsers.size, usersWithdrawnFromWallets)
      : successWithdrawalUsers.size;

    // Deposits (Gmail disetor) metrics sesuai timeframe
    const allTimeGmailCreated = allDepositsRaw.length;
    const allTimeGmailDiterima = allDepositsRaw.filter((d) =>
      ["diterima", "accepted", "sukses", "approved"].includes((d.status || "").toLowerCase())
    ).length;
    const allTimeGmailDicek = allDepositsRaw.filter((d) =>
      ["pending", "dicek", "proses", "menunggu"].includes((d.status || "").toLowerCase())
    ).length;
    const allTimeGmailDitolak = allDepositsRaw.filter((d) =>
      ["ditolak", "rejected", "batal"].includes((d.status || "").toLowerCase())
    ).length;

    // Period deposit counts
    const periodGmailCreated = filteredDeposits.length;
    const periodGmailDiterima = filteredDeposits.filter((d) =>
      ["diterima", "accepted", "sukses", "approved"].includes((d.status || "").toLowerCase())
    ).length;
    const periodGmailDicek = filteredDeposits.filter((d) =>
      ["pending", "dicek", "proses", "menunggu"].includes((d.status || "").toLowerCase())
    ).length;
    const periodGmailDitolak = filteredDeposits.filter((d) =>
      ["ditolak", "rejected", "batal"].includes((d.status || "").toLowerCase())
    ).length;

    // Cek apakah mode ALL atau periode tertentu
    const isAllTime = !cutoffDate || timeframe === "ALL";
    const hasPeriodDeposits = periodGmailCreated > 0;
    const isDepositsHistoricalFallback = !isAllTime && !hasPeriodDeposits && allTimeGmailCreated > 0;

    const totalGmailCreated = isAllTime ? allTimeGmailCreated : periodGmailCreated;
    const gmailDiterima = isAllTime ? allTimeGmailDiterima : periodGmailDiterima;
    const gmailDicek = isAllTime ? allTimeGmailDicek : periodGmailDicek;
    const gmailDitolak = isAllTime ? allTimeGmailDitolak : periodGmailDitolak;

    const acceptedDeposits = (isAllTime || hasPeriodDeposits ? filteredDeposits : allDepositsRaw).filter((d) =>
      ["diterima", "accepted", "sukses", "approved"].includes((d.status || "").toLowerCase())
    );
    const usersWithGmailSuccess = new Set(
      acceptedDeposits.map((d) => d.user_id)
    ).size;

    // Hitung Jumlah User Aktif (User yang melakukan setor, transaksi, withdraw, atau baru mendaftar di periode terpilih)
    const activeUserIds = new Set<string>();
    filteredDeposits.forEach((d) => { if (d.user_id) activeUserIds.add(d.user_id); });
    filteredWithdrawals.forEach((w) => { if (w.user_id) activeUserIds.add(w.user_id); });
    filteredTransactions.forEach((t) => { if (t.user_id) activeUserIds.add(t.user_id); });
    (profiles || []).forEach((p) => {
      if (!cutoffDate || new Date(p.created_at) >= cutoffDate) {
        activeUserIds.add(p.id);
      }
    });
    // Fallback: jika tidak ada aktivitas baru di jendela waktu tertentu (misal dev/pre-launch),
    // gunakan user yang memegang saldo atau pernah setor agar metrik realistis
    const activeUsersCount = activeUserIds.size > 0
      ? activeUserIds.size
      : Math.max(usersWithBalance, usersWithGmailSuccess, 1);

    let pendingWithdrawals = 0;
    let pendingWithdrawalsAmount = 0;
    (withdrawals || []).forEach((w) => {
      if (["pending", "diproses"].includes((w.status || "").toLowerCase())) {
        pendingWithdrawals++;
        pendingWithdrawalsAmount += Number(w.amount) || 0;
      }
    });

    // Build REAL-TIME chart series from actual DB deposits
    const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const toYmd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    let chartSeries: Array<{ date: string; amount: number; count: number }> = [];
    const chartTotalAmount = filteredDeposits.reduce(
      (acc, d) => acc + (Number(d.amount) || 0),
      0
    );

    if (timeframe === "1D") {
      const hourLabels = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "23:59"];
      const buckets = hourLabels.map((label) => ({ date: label, amount: 0, count: 0 }));
      filteredDeposits.forEach((d) => {
        const hr = new Date(d.created_at).getHours();
        const idx = Math.min(6, Math.floor(hr / 4));
        buckets[idx].amount += Number(d.amount) || 0;
        buckets[idx].count += 1;
      });
      chartSeries = buckets;
    } else {
      const dayMap = new Map<string, { amount: number; count: number }>();
      filteredDeposits.forEach((d) => {
        const key = toYmd(new Date(d.created_at));
        const cur = dayMap.get(key) || { amount: 0, count: 0 };
        cur.amount += Number(d.amount) || 0;
        cur.count += 1;
        dayMap.set(key, cur);
      });

      let numDays = 7;
      if (timeframe === "3D") numDays = 3;
      else if (timeframe === "7D") numDays = 7;
      else if (timeframe === "14D") numDays = 14;
      else if (timeframe === "30D") numDays = 30;
      else {
        // ALL: span from earliest deposit up to today (clamped between 7 and 60 days)
        if (filteredDeposits.length > 0) {
          const earliest = filteredDeposits.reduce((min, d) => {
            const t = new Date(d.created_at).getTime();
            return t < min ? t : min;
          }, now.getTime());
          const diffDays = Math.ceil((now.getTime() - earliest) / (24 * 60 * 60 * 1000)) + 1;
          numDays = Math.max(7, Math.min(60, diffDays));
        } else {
          numDays = 7;
        }
      }

      for (let i = numDays - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = toYmd(d);
        const entry = dayMap.get(key) || { amount: 0, count: 0 };
        chartSeries.push({
          date: `${d.getDate()} ${MONTHS_ID[d.getMonth()]}`,
          amount: entry.amount,
          count: entry.count,
        });
      }
    }

    // Recent transactions with populated user info (filtered by timeframe)
    const recentTransactionsWithUser = filteredTransactions.slice(0, 200).map((t) => ({
      ...t,
      userName: userMap[t.user_id]?.name || "Pengguna",
      userEmail: userMap[t.user_id]?.email || "-",
    }));

    // List Setoran: Tampilkan setoran periode jika ada, atau fallback ke seluruh riwayat jika periode kosong
    const depositsListSource = hasPeriodDeposits || isAllTime ? filteredDeposits : allDepositsRaw;
    const recentDepositsWithUser = depositsListSource.slice(0, 500).map((d: any) => {
      const rawNote = String(d.note || "").trim();
      const passwordMatch = rawNote.match(/^Password:\s*(.+)$/i);
      const emailPassword =
        (typeof d.password === "string" && d.password.trim()) ||
        (passwordMatch ? passwordMatch[1].trim() : "") ||
        ((d.category_id || "good") === "good" ? defaultPassword : "-");

      return {
        id: d.id,
        user_id: d.user_id,
        userName: userMap[d.user_id]?.name || "Pengguna",
        userEmail: userMap[d.user_id]?.email || "-",
        gmail: d.gmail || d.normalized_gmail || "-",
        password: emailPassword,
        status: d.status || "pending",
        category_id: d.category_id || "good",
        categoryLabel: d.category_id === "good" ? "Gmail Fresh" : "Gmail Bebas",
        amount: Number(d.amount) || (d.category_id === "good" ? (cfgPricePerGmail || 1500) : 1000),
        note: passwordMatch ? "-" : d.note || "-",
        created_at: d.created_at,
      };
    });

    // Recent withdrawals needing review
    const pendingWithdrawalsList = (withdrawals || [])
      .filter((w) => ["pending", "diproses"].includes((w.status || "").toLowerCase()))
      .slice(0, 5)
      .map((w) => ({
        ...w,
        userName: userMap[w.user_id]?.name || "Pengguna",
        userEmail: userMap[w.user_id]?.email || "-",
      }));

    // Recent users with their REAL live wallet balances
    const recentUsersWithWallet = (profiles || []).slice(0, 6).map((p) => ({
      id: p.id,
      name: p.name || p.email?.split("@")[0] || "Pengguna",
      email: p.email || "-",
      role: p.role || "User",
      avatar_url: p.avatar_url,
      created_at: p.created_at,
      balance: walletMap[p.id]?.balance || 0,
      total_withdrawn: walletMap[p.id]?.total_withdrawn || 0,
    }));

    const latencyMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      timeframe,
      stats: {
        totalUsers,
        totalAdmins,
        totalMembers,
        activeUsersCount,
        totalBalance,
        usersWithBalance,
        totalWithdrawn,
        usersWithdrawnCount,
        totalWithdrawalTransactions,
        totalGmailCreated,
        gmailDiterima,
        gmailDicek,
        gmailDitolak,
        allTimeGmailCreated,
        allTimeGmailDiterima,
        allTimeGmailDicek,
        allTimeGmailDitolak,
        isDepositsHistoricalFallback,
        usersWithGmailSuccess,
        totalEarned,
        pendingWithdrawals,
        pendingWithdrawalsAmount,
        totalTransactionsCount: filteredTransactions.length,
        totalWithdrawalsCount: filteredWithdrawals.length,
        gmailPrice:
          cfgPricePerGmail ||
          categories?.find((c: any) => c.id === "good")?.price ||
          categories?.[0]?.price ||
          1500,
        defaultPassword,
        chartTotalAmount,
      },
      chartSeries,
      systemHealth: {
        supabaseConnected: true,
        latencyMs,
        telegramConfigured: !!process.env.TELEGRAM_BOT_TOKEN,
        adminCount: getAdminEmails().length,
        timestamp: new Date().toISOString(),
      },
      recentUsers: recentUsersWithWallet,
      recentTransactions: recentTransactionsWithUser,
      recentDeposits: recentDepositsWithUser,
      pendingWithdrawalsList,
    });
  } catch (err: any) {
    console.error("Stats API error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load dashboard stats" },
      { status: 500 }
    );
  }
}
