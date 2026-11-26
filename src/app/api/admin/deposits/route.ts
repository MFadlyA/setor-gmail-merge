import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, fetchAllRows } from "@/lib/supabase/admin";
import { requireAdminAuth } from "@/lib/security/auth-guard";
import { sanitizeString } from "@/lib/security/sanitize";
import { logAuditEvent } from "@/lib/security/audit-logger";
import {
  ISSUE_DEPOSIT_STATUSES,
  isAcceptedDepositStatus,
  isPendingDepositStatus,
  isRejectedDepositStatus,
  isIssueDepositStatus,
} from "@/lib/mock-data";

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response!;

  try {
    const searchParams = req.nextUrl.searchParams;
    const filterStatus = searchParams.get("status") || "all";
    const filterCategory = searchParams.get("category") || "all";
    const search = searchParams.get("search")?.toLowerCase().trim() || "";

    // Parallel fetch all profiles, categories, site_config, and deposits
    const [
      { data: profiles },
      { data: categories },
      { data: cfgRow },
      { data: depositsData, error: depError },
    ] = await Promise.all([
      fetchAllRows((from, to) =>
        supabaseAdmin
          .from("profiles")
          .select("id, name, email, dana_number")
          .order("id", { ascending: true })
          .range(from, to)
      ),
      supabaseAdmin.from("setor_categories").select("*"),
      supabaseAdmin.from("app_settings").select("value").eq("key", "site_config").maybeSingle(),
      fetchAllRows((from, to) => {
        let q = supabaseAdmin
          .from("deposits")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to);
        if (filterStatus === "accepted" || filterStatus === "diterima") {
          q = q.in("status", ["accepted", "diterima"]);
        } else if (filterStatus === "rejected" || filterStatus === "ditolak") {
          q = q.in("status", ["rejected", "ditolak"]);
        } else if (filterStatus === "pending" || filterStatus === "dicek") {
          q = q.in("status", ["pending", "dicek"]);
        } else if (filterStatus === "problematic" || filterStatus === "bermasalah") {
          q = q.in("status", [...ISSUE_DEPOSIT_STATUSES]);
        } else if (filterStatus !== "all") {
          q = q.eq("status", filterStatus);
        }
        if (filterCategory !== "all") {
          q = q.eq("category_id", filterCategory);
        }
        return q;
      }),
    ]);

    if (depError) throw depError;

    let cmsDefaultPassword = "winter1212";
    let cmsFreshPrice = 1500;
    let cmsBebasPrice = 1000;
    if (cfgRow?.value) {
      try {
        const parsedCfg = typeof cfgRow.value === "string" ? JSON.parse(cfgRow.value) : cfgRow.value;
        if (parsedCfg?.default_password) cmsDefaultPassword = String(parsedCfg.default_password);
        if (Number(parsedCfg?.price_per_gmail) > 0) cmsFreshPrice = Number(parsedCfg.price_per_gmail);
        if (Number(parsedCfg?.price_bebas) > 0) cmsBebasPrice = Number(parsedCfg.price_bebas);
      } catch {}
    }

    const userMap: Record<string, { name: string; email: string; dana: string }> = {};
    (profiles || []).forEach((p) => {
      userMap[p.id] = {
        name: p.name || p.email?.split("@")[0] || "Pengguna",
        email: p.email || "-",
        dana: p.dana_number || "-",
      };
    });

    const categoryMap: Record<string, any> = {};
    (categories || []).forEach((c) => {
      categoryMap[c.id] = c;
    });

    let items = (depositsData || []).map((d) => {
      const user = userMap[d.user_id] || {
        name: "Pengguna",
        email: "-",
        dana: "-",
      };
      const cat = categoryMap[d.category_id] || {
        label: d.category_id === "good" ? "Gmail Fresh" : "Gmail Lama",
        price: d.amount || (d.category_id === "good" ? cmsFreshPrice : cmsBebasPrice),
      };

      const rawNote = typeof d.note === "string" ? d.note.trim() : "";
      const passwordMatch = rawNote.match(/Password:\s*([^|]+)/i);
      const secretMatch = rawNote.match(/2FA:\s*([A-Za-z2-7\s-]+)/i);
      const contactMatch = rawNote.match(/Kontak:\s*([^|]+)/i);

      const resolvedPassword =
        (typeof d.password === "string" && d.password.trim()) ||
        (passwordMatch ? passwordMatch[1].trim() : "") ||
        (d.category_id === "good" ? cmsDefaultPassword : "-");

      const resolvedTotpSecret =
        (typeof d.totp_secret === "string" && d.totp_secret.trim()) ||
        (secretMatch ? secretMatch[1].trim() : "") ||
        "-";

      const resolvedContact =
        (typeof d.contact_info === "string" && d.contact_info.trim()) ||
        (contactMatch ? contactMatch[1].trim() : "") ||
        "-";

      const displayNote =
        rawNote
          .replace(/\|?\s*Password:\s*[^|]+/gi, "")
          .replace(/\|?\s*2FA:\s*[A-Za-z2-7\s-]+/gi, "")
          .replace(/\|?\s*Kontak:\s*[^|]+/gi, "")
          .replace(/^\s*\|\s*|\s*\|\s*$/g, "")
          .trim() || "-";

      return {
        id: d.id,
        user_id: d.user_id,
        user_name: user.name,
        user_email: user.email,
        user_dana: user.dana,
        batch_id: d.batch_id,
        gmail: d.gmail || "-",
        normalized_gmail: d.normalized_gmail || d.gmail || "-",
        password: resolvedPassword,
        totp_secret: resolvedTotpSecret,
        contact_info: resolvedContact,
        category_id: d.category_id || "good",
        category_label: cat.label,
        status: d.status || "pending",
        amount: Number(d.amount) || Number(cat.price) || cmsFreshPrice,
        note: displayNote,
        checked_at: d.checked_at,
        created_at: d.created_at,
      };
    });

    // Filter by search string if provided
    if (search) {
      items = items.filter(
        (it) =>
          it.gmail.toLowerCase().includes(search) ||
          it.user_name.toLowerCase().includes(search) ||
          it.user_email.toLowerCase().includes(search) ||
          it.user_dana.toLowerCase().includes(search) ||
          it.contact_info.toLowerCase().includes(search) ||
          it.category_label.toLowerCase().includes(search)
      );
    }

    // Stats calculations
    const allDeposits = depositsData || [];

    const stats = {
      total: allDeposits.length,
      accepted: allDeposits.filter((d) => isAcceptedDepositStatus(d.status)).length,
      pending: allDeposits.filter((d) => isPendingDepositStatus(d.status)).length,
      problematic: allDeposits.filter((d) => isIssueDepositStatus(d.status)).length,
      rejected: allDeposits.filter((d) => isRejectedDepositStatus(d.status)).length,
      totalAmount: allDeposits
        .filter((d) => isAcceptedDepositStatus(d.status))
        .reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
    };

    return NextResponse.json({
      success: true,
      deposits: items,
      stats,
      categories: categories || [],
    });
  } catch (err: any) {
    console.error("Deposits GET API error:", err);
    return NextResponse.json(
      { success: false, error: "Gagal mengambil data setoran Gmail" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response!;

  try {
    const body = await req.json();
    const id = sanitizeString(body.id, 100);
    const newStatus = sanitizeString(body.newStatus, 30).toLowerCase();
    const adminNote = body.adminNote !== undefined ? sanitizeString(body.adminNote, 500) : undefined;

    if (!id || !newStatus) {
      return NextResponse.json(
        { success: false, error: "ID dan Status Baru diperlukan" },
        { status: 400 }
      );
    }

    const STATUS_MAP: Record<string, string> = {
      accepted: "diterima",
      diterima: "diterima",
      rejected: "ditolak",
      ditolak: "ditolak",
      pending: "pending",
      dicek: "dicek",
    };

    const canonicalStatus = STATUS_MAP[newStatus];
    if (!canonicalStatus) {
      return NextResponse.json(
        { success: false, error: "Status baru tidak valid" },
        { status: 400 }
      );
    }

    // 1. Get deposit row
    const { data: deposit, error: fetchErr } = await supabaseAdmin
      .from("deposits")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !deposit) {
      return NextResponse.json(
        { success: false, error: "Data setoran Gmail tidak ditemukan" },
        { status: 404 }
      );
    }

    const prevStatus = String(deposit.status || "pending");
    const prevLower = prevStatus.toLowerCase();
    const wasAlreadyAccepted = prevLower === "accepted" || prevLower === "diterima";
    const nowStr = new Date().toISOString();

    // Prevent reverting an already accepted & credited deposit to avoid double-crediting later
    if (wasAlreadyAccepted && canonicalStatus !== "diterima") {
      return NextResponse.json(
        {
          success: false,
          error: "Setoran yang sudah diterima dan dicairkan saldonya tidak dapat diubah kembali.",
        },
        { status: 400 }
      );
    }

    // 2. Atomic conditional update (prevents concurrent double-credit race condition)
    const updatePayload: any = {
      status: canonicalStatus,
      checked_at: canonicalStatus === "pending" ? null : nowStr,
      updated_at: nowStr,
    };
    if (adminNote !== undefined) {
      const prevRawNote = typeof deposit.note === "string" ? deposit.note : "";
      const preservedParts: string[] = [];
      if (adminNote.trim()) preservedParts.push(adminNote.trim());
      if (!deposit.password) {
        const pm = prevRawNote.match(/Password:\s*([^|]+)/i);
        if (pm?.[1]?.trim()) preservedParts.push(`Password: ${pm[1].trim()}`);
      }
      if (!deposit.totp_secret) {
        const sm = prevRawNote.match(/2FA:\s*([A-Za-z2-7\s-]+)/i);
        if (sm?.[1]?.trim()) preservedParts.push(`2FA: ${sm[1].trim()}`);
      }
      if (!deposit.contact_info) {
        const cm = prevRawNote.match(/Kontak:\s*([^|]+)/i);
        if (cm?.[1]?.trim()) preservedParts.push(`Kontak: ${cm[1].trim()}`);
      }
      updatePayload.note = preservedParts.join(" | ");
    }

    const { data: updatedRows, error: updErr } = await supabaseAdmin
      .from("deposits")
      .update(updatePayload)
      .eq("id", id)
      .eq("status", prevStatus)
      .select("id");

    if (updErr) throw updErr;
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Status setoran sudah berubah oleh permintaan lain." },
        { status: 409 }
      );
    }

    // 3. If accepted and was NOT previously accepted, credit user's wallet & insert transaction
    if (canonicalStatus === "diterima" && !wasAlreadyAccepted) {
      const rewardAmount = Number(deposit.amount) || 1500;

      const { data: wallet } = await supabaseAdmin
        .from("wallets")
        .select("balance, total_earned")
        .eq("user_id", deposit.user_id)
        .maybeSingle();

      if (wallet) {
        await supabaseAdmin
          .from("wallets")
          .update({
            balance: Number(wallet.balance) + rewardAmount,
            total_earned: Number(wallet.total_earned) + rewardAmount,
            updated_at: nowStr,
          })
          .eq("user_id", deposit.user_id);
      }

      await supabaseAdmin.from("transactions").insert({
        user_id: deposit.user_id,
        type: "deposit",
        amount: rewardAmount,
        title: "Setoran Gmail Diterima",
        description: `Setoran akun Gmail (${deposit.gmail}) berhasil diverifikasi oleh Admin.`,
        status: "success",
      });
    }

    // Record audit event
    await logAuditEvent({
      event: "DEPOSIT_STATUS_CHANGE",
      severity: "INFO",
      actorId: auth.user?.id,
      actorEmail: auth.user?.email,
      targetId: id,
      ip: auth.clientIp,
      country: auth.country,
      details: {
        gmail: deposit.gmail,
        prevStatus,
        newStatus: canonicalStatus,
        adminNote,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Status setoran Gmail berhasil diubah menjadi ${canonicalStatus}`,
    });
  } catch (err: any) {
    console.error("Deposits PATCH API error:", err);
    return NextResponse.json(
      { success: false, error: "Gagal mengubah status setoran Gmail" },
      { status: 500 }
    );
  }
}
