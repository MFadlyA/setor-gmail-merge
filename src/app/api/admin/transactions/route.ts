import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, fetchAllRows } from "@/lib/supabase/admin";
import { requireAdminAuth } from "@/lib/security/auth-guard";
import { sanitizeString, sanitizeNumber } from "@/lib/security/sanitize";
import { logAuditEvent } from "@/lib/security/audit-logger";
import { isDanaConfigured } from "@/lib/dana/client";
import {
  checkMdaBalance,
  disburseToDana,
  generatePartnerReferenceNo,
  queryTopUpStatus,
} from "@/lib/dana/disbursement";

async function safeUpdateWdRow(
  id: string,
  payload: Record<string, unknown>,
  expectedPrevStatus?: string
): Promise<{ updated: boolean; error?: any }> {
  let q = supabaseAdmin.from("withdrawals").update(payload).eq("id", id);
  if (expectedPrevStatus !== undefined) {
    q = q.eq("status", expectedPrevStatus);
  }
  let { data, error } = await q.select("id");

  if (error && /dana_/i.test(error.message || "")) {
    const cleanPayload = { ...payload };
    delete cleanPayload.dana_partner_reference_no;
    delete cleanPayload.dana_reference_no;
    delete cleanPayload.dana_response_code;
    delete cleanPayload.dana_response_message;
    delete cleanPayload.dana_checked_at;

    let retryQ = supabaseAdmin.from("withdrawals").update(cleanPayload).eq("id", id);
    if (expectedPrevStatus !== undefined) {
      retryQ = retryQ.eq("status", expectedPrevStatus);
    }
    const retry = await retryQ.select("id");
    data = retry.data;
    error = retry.error;
  }

  return { updated: Boolean(data && data.length > 0), error };
}

async function refundUserWithdrawalBalance(
  wd: any,
  reasonText: string,
  nowIso: string
) {
  const { data: wallet } = await supabaseAdmin
    .from("wallets")
    .select("balance, total_withdrawn")
    .eq("user_id", wd.user_id)
    .maybeSingle();

  if (wallet) {
    await supabaseAdmin
      .from("wallets")
      .update({
        balance: Number(wallet.balance) + Number(wd.amount),
        total_withdrawn: Math.max(0, Number(wallet.total_withdrawn) - Number(wd.amount)),
        updated_at: nowIso,
      })
      .eq("user_id", wd.user_id);

    await supabaseAdmin.from("transactions").insert({
      user_id: wd.user_id,
      type: "refund",
      amount: wd.amount,
      title: "Pengembalian Dana Penarikan",
      description: `Refund penarikan #${String(wd.id).slice(0, 8)} (${reasonText})`,
      status: "success",
    });
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response!;

  try {
    const searchParams = req.nextUrl.searchParams;
    const filterType = searchParams.get("type") || "all";
    const filterStatus = searchParams.get("status") || "all";
    const search = searchParams.get("search")?.toLowerCase().trim() || "";

    const profilesPromise = fetchAllRows((from, to) =>
      supabaseAdmin
        .from("profiles")
        .select("id, name, email, dana_number")
        .order("id", { ascending: true })
        .range(from, to)
    );

    let txPromise: Promise<{ data: any[]; error?: any }> = Promise.resolve({ data: [] });
    if (
      filterType === "all" ||
      filterType === "transaction" ||
      filterType === "deposit" ||
      filterType === "adjustment"
    ) {
      txPromise = fetchAllRows((from, to) => {
        let q = supabaseAdmin
          .from("transactions")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to);

        if (filterStatus !== "all") {
          q = q.eq("status", filterStatus);
        }
        return q;
      });
    }

    let wdPromise: Promise<{ data: any[]; error?: any }> = Promise.resolve({ data: [] });
    if (filterType === "all" || filterType === "withdrawal") {
      wdPromise = fetchAllRows((from, to) => {
        let q = supabaseAdmin
          .from("withdrawals")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to);

        if (filterStatus !== "all") {
          q = q.eq("status", filterStatus);
        }
        return q;
      });
    }

    const [{ data: profiles }, { data: txs }, { data: wds }] = await Promise.all([
      profilesPromise,
      txPromise,
      wdPromise,
    ]);

    const userMap: Record<string, { name: string; email: string; dana: string }> = {};
    (profiles || []).forEach((p) => {
      userMap[p.id] = {
        name: p.name || p.email?.split("@")[0] || "Pengguna",
        email: p.email || "-",
        dana: p.dana_number || "-",
      };
    });

    const items: any[] = [];

    (txs || []).forEach((t: any) => {
      items.push({
        id: t.id,
        source_table: "transactions",
        user_id: t.user_id,
        user_name: userMap[t.user_id]?.name || "Pengguna",
        user_email: userMap[t.user_id]?.email || "-",
        type: t.type || "transaction",
        amount: Number(t.amount) || 0,
        title: t.title || "Transaksi Saldo",
        description: t.description || "-",
        status: t.status || "success",
        created_at: t.created_at,
        details: null,
      });
    });

    (wds || []).forEach((w: any) => {
      items.push({
        id: w.id,
        source_table: "withdrawals",
        user_id: w.user_id,
        user_name: userMap[w.user_id]?.name || "Pengguna",
        user_email: userMap[w.user_id]?.email || "-",
        type: "withdrawal",
        amount: Number(w.amount) || 0,
        title: `Penarikan (${w.method || "DANA"})`,
        description: `Rekening: ${w.account_number || "-"} a/n ${w.account_name || "-"}${
          w.dana_reference_no ? ` • Ref DANA: ${w.dana_reference_no}` : ""
        }`,
        status: w.status || "pending",
        created_at: w.created_at,
        details: {
          method: w.method,
          account_number: w.account_number,
          account_name: w.account_name,
          tax_fee: w.tax_fee,
          net_amount: w.net_amount,
          admin_note: w.admin_note,
          proof_url: w.proof_url,
          dana_partner_reference_no: w.dana_partner_reference_no || null,
          dana_reference_no: w.dana_reference_no || null,
          dana_response_code: w.dana_response_code || null,
          dana_response_message: w.dana_response_message || null,
          dana_checked_at: w.dana_checked_at || null,
        },
      });
    });

    items.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    let filtered = items;
    if (search) {
      filtered = filtered.filter(
        (i) =>
          i.user_name.toLowerCase().includes(search) ||
          i.user_email.toLowerCase().includes(search) ||
          i.title.toLowerCase().includes(search) ||
          i.description.toLowerCase().includes(search) ||
          i.id.toLowerCase().includes(search) ||
          String(i.details?.dana_partner_reference_no || "")
            .toLowerCase()
            .includes(search) ||
          String(i.details?.dana_reference_no || "")
            .toLowerCase()
            .includes(search)
      );
    }

    return NextResponse.json({ success: true, transactions: filtered });
  } catch (err: any) {
    console.error("Transactions GET API error:", err);
    return NextResponse.json(
      { success: false, error: "Gagal memuat transaksi" },
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
    const sourceTable = sanitizeString(body.sourceTable, 50);
    const newStatus = sanitizeString(body.newStatus, 30).toLowerCase();
    const adminNote = body.adminNote ? sanitizeString(body.adminNote, 500) : "";

    if (!id || !newStatus) {
      return NextResponse.json(
        { success: false, error: "ID dan Status Baru diperlukan" },
        { status: 400 }
      );
    }

    if (sourceTable === "withdrawals") {
      const { data: wd, error: getErr } = await supabaseAdmin
        .from("withdrawals")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (getErr || !wd) {
        return NextResponse.json(
          { success: false, error: "Data penarikan tidak ditemukan" },
          { status: 404 }
        );
      }

      const wdStatusMap: Record<string, { wd: string; tx: string }> = {
        success: { wd: "berhasil", tx: "success" },
        berhasil: { wd: "berhasil", tx: "success" },
        rejected: { wd: "ditolak", tx: "failed" },
        failed: { wd: "ditolak", tx: "failed" },
        ditolak: { wd: "ditolak", tx: "failed" },
      };

      const mapped = wdStatusMap[newStatus];
      if (!mapped) {
        return NextResponse.json(
          { success: false, error: "Status penarikan tidak valid" },
          { status: 400 }
        );
      }

      const prevWdStatus = String(wd.status || "diproses");
      const wasPending = ["diproses", "pending"].includes(prevWdStatus.toLowerCase());
      if (!wasPending) {
        return NextResponse.json(
          {
            success: false,
            error: `Penarikan ini sudah berstatus "${prevWdStatus}" dan tidak dapat diproses ulang.`,
          },
          { status: 409 }
        );
      }

      const isDanaMethod = String(wd.method || "DANA").toUpperCase() === "DANA";
      const existingPartnerRef =
        typeof wd.dana_partner_reference_no === "string" && wd.dana_partner_reference_no.trim()
          ? wd.dana_partner_reference_no.trim()
          : null;
      const nowIso = new Date().toISOString();

      // Safety check if an earlier DANA transfer call was uncertain (`dana_partner_reference_no` exists)
      if (isDanaMethod && existingPartnerRef && isDanaConfigured()) {
        const priorStatus = await queryTopUpStatus(
          existingPartnerRef,
          wd.dana_reference_no || undefined
        );

        if (priorStatus.mappedOutcome === "SUCCESS") {
          const { updated } = await safeUpdateWdRow(
            id,
            {
              status: "berhasil",
              processed_at: nowIso,
              updated_at: nowIso,
              dana_reference_no: priorStatus.originalReferenceNo || wd.dana_reference_no || null,
              dana_response_code: `STATUS_${priorStatus.latestTransactionStatus}`,
              dana_response_message: priorStatus.transactionStatusDesc || "Success via Inquiry Status",
              dana_checked_at: nowIso,
              admin_note: "Terverifikasi sudah Berhasil di DANA (00 Success)",
            },
            prevWdStatus
          );

          if (updated) {
            await supabaseAdmin
              .from("transactions")
              .update({ status: "success" })
              .eq("reference_id", id);
          }

          if (mapped.wd === "ditolak") {
            return NextResponse.json(
              {
                success: false,
                error:
                  "Tidak dapat menolak: Dana ternyata SUDAH BERHASIL masuk ke akun DANA pengguna. Status diperbarui ke Berhasil.",
              },
              { status: 409 }
            );
          }

          return NextResponse.json({
            success: true,
            message: "Transaksi terverifikasi sudah Berhasil di DANA!",
          });
        }

        if (priorStatus.mappedOutcome === "PENDING") {
          return NextResponse.json(
            {
              success: false,
              error: `Transaksi ini masih berstatus Pending (${priorStatus.latestTransactionStatus}) di server DANA. Tunggu beberapa saat lalu gunakan tombol Rekonsiliasi DANA.`,
            },
            { status: 409 }
          );
        }

        if (priorStatus.mappedOutcome === "FAILED" && mapped.wd === "berhasil") {
          // Previous attempt definitively failed at DANA; allow fresh retry below with new partnerReferenceNo
        }
      }

      // Admin Approve (`berhasil`) for DANA -> Call `transferToDana` via DANA API!
      if (isDanaMethod && mapped.wd === "berhasil") {
        if (!isDanaConfigured()) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Kredensial API DANA belum dikonfigurasi pada environment server. Isi variabel DANA_* terlebih dahulu.",
            },
            { status: 503 }
          );
        }

        const netAmountToSend = Math.max(
          0,
          Number(wd.net_amount) || Number(wd.amount) - Number(wd.tax_fee || 0)
        );

        // Pre-check MDA balance if DANA_MERCHANT_ID is set
        const mda = await checkMdaBalance();
        if (mda.ok && typeof mda.balanceIdr === "number" && mda.balanceIdr < netAmountToSend) {
          return NextResponse.json(
            {
              success: false,
              error: `Saldo Merchant DANA (MDA) tidak mencukupi (tersedia Rp${mda.balanceIdr.toLocaleString("id-ID")}, butuh Rp${netAmountToSend.toLocaleString("id-ID")}). Silakan top-up MDA terlebih dahulu.`,
            },
            { status: 400 }
          );
        }

        // Claim atomic concurrency lock by transitioning status temporarily or guarding partnerRefNo
        const partnerRefNo = generatePartnerReferenceNo("WD", id);
        const { updated: claimed, error: claimErr } = await safeUpdateWdRow(
          id,
          {
            dana_partner_reference_no: partnerRefNo,
            dana_response_code: "ADMIN_DISBURSING",
            updated_at: nowIso,
          },
          prevWdStatus
        );

        if (claimErr) throw claimErr;
        if (!claimed) {
          return NextResponse.json(
            { success: false, error: "Status penarikan sudah diproses oleh permintaan lain." },
            { status: 409 }
          );
        }

        const disburseRes = await disburseToDana({
          partnerReferenceNo: partnerRefNo,
          phoneNumber: wd.account_number,
          amountIdr: netAmountToSend,
          notes: adminNote || `Approve WD Setor Gmail #${id.slice(0, 8)}`,
        });

        const doneIso = new Date().toISOString();

        if (disburseRes.outcome === "SUCCESS") {
          await safeUpdateWdRow(id, {
            status: "berhasil",
            processed_at: doneIso,
            updated_at: doneIso,
            dana_partner_reference_no: partnerRefNo,
            dana_reference_no: disburseRes.referenceNo || null,
            dana_response_code: disburseRes.responseCode,
            dana_response_message: disburseRes.responseMessage,
            dana_checked_at: doneIso,
            admin_note:
              adminNote ||
              (disburseRes.inconsistentFlag
                ? "Disetujui Admin (4043818 Inconsistent Request — cek portal DANA)"
                : "Disetujui Admin & cair otomatis via DANA"),
          });

          await supabaseAdmin
            .from("transactions")
            .update({ status: "success" })
            .eq("reference_id", id);

          await logAuditEvent({
            event: "WITHDRAWAL_STATUS_CHANGE",
            severity: "INFO",
            actorId: auth.user?.id,
            actorEmail: auth.user?.email,
            targetId: id,
            ip: auth.clientIp,
            country: auth.country,
            details: {
              action: "ADMIN_APPROVE_DANA_SUCCESS",
              amount: wd.amount,
              netAmount: netAmountToSend,
              partnerReferenceNo: partnerRefNo,
              referenceNo: disburseRes.referenceNo,
              responseCode: disburseRes.responseCode,
            },
          });

          return NextResponse.json({
            success: true,
            referenceNo: disburseRes.referenceNo,
            message: `Saldo Rp${netAmountToSend.toLocaleString("id-ID")} berhasil dicairkan ke DANA pengguna!`,
          });
        }

        if (disburseRes.outcome === "MDA_INSUFFICIENT") {
          await safeUpdateWdRow(id, {
            dana_partner_reference_no: null,
            dana_response_code: disburseRes.responseCode,
            dana_response_message: disburseRes.responseMessage,
            updated_at: doneIso,
          });

          return NextResponse.json(
            {
              success: false,
              error:
                "Saldo Merchant DANA (MDA) tidak mencukupi (4033814). Silakan top-up MDA terlebih dahulu lalu klik Setujui kembali.",
            },
            { status: 400 }
          );
        }

        if (disburseRes.outcome === "PENDING_RECONCILE") {
          await safeUpdateWdRow(id, {
            dana_partner_reference_no: partnerRefNo,
            dana_response_code: disburseRes.responseCode,
            dana_response_message: disburseRes.responseMessage,
            dana_checked_at: doneIso,
            updated_at: doneIso,
          });

          return NextResponse.json({
            success: true,
            pendingDana: true,
            message:
              "DANA merespons Pending/Timeout. Dana ditahan pada status Diproses demi mencegah pencairan ganda — klik tombol Rekonsiliasi DANA sebentar lagi.",
          });
        }

        // Definitive failure (`DEF_FAILED`) -> Mark `ditolak` + atomic wallet refund
        const { updated: markedFailed } = await safeUpdateWdRow(
          id,
          {
            status: "ditolak",
            updated_at: doneIso,
            dana_partner_reference_no: partnerRefNo,
            dana_response_code: disburseRes.responseCode,
            dana_response_message: disburseRes.responseMessage,
            dana_checked_at: doneIso,
            admin_note: `Gagal Disbursement DANA (${disburseRes.responseCode}): ${disburseRes.responseMessage}`,
          },
          prevWdStatus
        );

        if (markedFailed) {
          await supabaseAdmin
            .from("transactions")
            .update({ status: "failed" })
            .eq("reference_id", id);

          await refundUserWithdrawalBalance(
            wd,
            `Gagal pencairan DANA (${disburseRes.responseCode})`,
            doneIso
          );
        }

        return NextResponse.json(
          {
            success: false,
            error: `Pencairan ditolak oleh DANA (${disburseRes.responseCode}): ${
              disburseRes.friendlyError || disburseRes.responseMessage
            }. Saldo pengguna telah dikembalikan otomatis.`,
          },
          { status: 400 }
        );
      }

      // Manual reject (`ditolak`) or legacy non-DANA update
      const updatePayload: Record<string, unknown> = {
        status: mapped.wd,
        updated_at: nowIso,
      };
      if (adminNote) updatePayload.admin_note = adminNote;
      if (mapped.wd === "berhasil") {
        updatePayload.processed_at = nowIso;
      }

      const { updated, error: updErr } = await safeUpdateWdRow(id, updatePayload, prevWdStatus);
      if (updErr) throw updErr;
      if (!updated) {
        return NextResponse.json(
          { success: false, error: "Status penarikan sudah berubah oleh permintaan lain." },
          { status: 409 }
        );
      }

      await supabaseAdmin
        .from("transactions")
        .update({ status: mapped.tx })
        .eq("reference_id", id);

      if (mapped.wd === "ditolak" && wasPending) {
        await refundUserWithdrawalBalance(
          wd,
          adminNote || "Penarikan ditolak oleh Admin",
          nowIso
        );
      }

      await logAuditEvent({
        event: "WITHDRAWAL_STATUS_CHANGE",
        severity: "INFO",
        actorId: auth.user?.id,
        actorEmail: auth.user?.email,
        targetId: id,
        ip: auth.clientIp,
        country: auth.country,
        details: {
          prevStatus: prevWdStatus,
          newStatus: mapped.wd,
          adminNote,
          userId: wd.user_id,
          amount: wd.amount,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Status penarikan berhasil diubah ke ${mapped.wd}`,
      });
    }

    // Default to transactions table
    const ALLOWED_TX_STATUSES = ["success", "pending", "failed"];
    if (!ALLOWED_TX_STATUSES.includes(newStatus)) {
      return NextResponse.json(
        { success: false, error: "Status transaksi tidak valid" },
        { status: 400 }
      );
    }

    const { error: tErr } = await supabaseAdmin
      .from("transactions")
      .update({ status: newStatus })
      .eq("id", id);

    if (tErr) throw tErr;

    return NextResponse.json({
      success: true,
      message: `Status transaksi berhasil diubah ke ${newStatus}`,
    });
  } catch (err: any) {
    console.error("Transactions PATCH API error:", err);
    return NextResponse.json(
      { success: false, error: "Gagal memperbarui status transaksi" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.authorized) return auth.response!;

  try {
    const body = await req.json();
    const userId = sanitizeString(body.userId, 100);
    const type = sanitizeString(body.type || "deposit", 30);
    const amount = sanitizeNumber(body.amount, 1, 1_000_000_000, 0);
    const title = sanitizeString(body.title, 200);
    const description = sanitizeString(body.description, 500);

    if (!userId || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "User ID dan Nominal valid (> 0) wajib diisi" },
        { status: 400 }
      );
    }

    const numAmount = amount;

    const { data: tx, error: txErr } = await supabaseAdmin
      .from("transactions")
      .insert({
        user_id: userId,
        type: type || "deposit",
        amount: numAmount,
        title: title || "Deposit Saldo Manual oleh Admin",
        description: description || "Ditambahkan melalui dashboard admin",
        status: "success",
      })
      .select()
      .single();

    if (txErr) throw txErr;

    const { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("balance, total_earned")
      .eq("user_id", userId)
      .maybeSingle();

    if (wallet) {
      await supabaseAdmin
        .from("wallets")
        .update({
          balance: Number(wallet.balance) + numAmount,
          total_earned: Number(wallet.total_earned) + numAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    } else {
      await supabaseAdmin.from("wallets").insert({
        user_id: userId,
        balance: numAmount,
        total_earned: numAmount,
        total_withdrawn: 0,
        minimum_withdrawal: 5000,
      });
    }

    await logAuditEvent({
      event: "UPDATE_BALANCE",
      severity: "CRITICAL",
      actorId: auth.user?.id,
      actorEmail: auth.user?.email,
      targetId: userId,
      ip: auth.clientIp,
      country: auth.country,
      details: { amount: numAmount, type, title, description },
    });

    return NextResponse.json({
      success: true,
      message: "Transaksi dan saldo pengguna berhasil ditambahkan",
      transaction: tx,
    });
  } catch (err: any) {
    console.error("Transactions POST API error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Gagal menambahkan transaksi" },
      { status: 500 }
    );
  }
}
