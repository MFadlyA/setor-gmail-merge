"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Mail,
  Search,
  CheckCircle,
  XCircle,
  RefreshCw,
  Wallet,
  Clock,
  Copy,
  Check,
  KeyRound,
  AlertTriangle,
  RotateCcw,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { AdminLiveOtpCell } from "@/components/admin/ui/live-otp-cell";
import {
  MaskedPasswordCell,
  logAdminCredentialAction,
  maskContactValue,
} from "@/components/admin/ui/masked-secret-cell";
import { Modal } from "@/components/admin/ui/modal";
import { Textarea } from "@/components/admin/ui/input";
import { adminFetch } from "@/lib/api-client";
import {
  isPendingDepositStatus,
  isIssueDepositStatus,
  getDepositStatusAdminMeta,
} from "@/lib/mock-data";

export default function DepositsPage() {
  // Gmail Deposits State
  const [deposits, setDeposits] = useState<any[]>([]);
  const [depositStats, setDepositStats] = useState({
    total: 0,
    accepted: 0,
    pending: 0,
    problematic: 0,
    rejected: 0,
    totalAmount: 0,
  });
  const [isLoadingDeposits, setIsLoadingDeposits] = useState(true);
  const [depositSearch, setDepositSearch] = useState("");
  const [depositCategoryFilter, setDepositCategoryFilter] = useState("all");
  const [depositStatusFilter, setDepositStatusFilter] = useState("all");
  const [copiedGmailId, setCopiedGmailId] = useState<string | null>(null);
  const [copiedPasswordId, setCopiedPasswordId] = useState<string | null>(null);
  const [copiedSecretId, setCopiedSecretId] = useState<string | null>(null);
  const [copiedContactId, setCopiedContactId] = useState<string | null>(null);
  const [categories, setCategories] = useState<any[]>([]);

  // Deposit Detail / Verification Modal
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<any>(null);
  const [depositAdminNote, setDepositAdminNote] = useState("");
  const [isUpdatingDeposit, setIsUpdatingDeposit] = useState(false);
  const [showModalPassword, setShowModalPassword] = useState(false);
  const [showModalSecret, setShowModalSecret] = useState(false);
  const [showModalOtp, setShowModalOtp] = useState(false);
  const [showModalContact, setShowModalContact] = useState(false);

  const openDepositModal = (dep: any) => {
    setShowModalPassword(false);
    setShowModalSecret(false);
    setShowModalOtp(false);
    setShowModalContact(false);
    setSelectedDeposit(dep);
    setDepositAdminNote(dep.note !== "-" ? dep.note : "");
    setDepositModalOpen(true);
  };

  // Fetch Gmail deposits
  const fetchDeposits = useCallback(async () => {
    setIsLoadingDeposits(true);
    try {
      const params = new URLSearchParams();
      if (depositCategoryFilter !== "all") params.set("category", depositCategoryFilter);
      if (depositStatusFilter !== "all") params.set("status", depositStatusFilter);
      if (depositSearch) params.set("search", depositSearch);

      const res = await adminFetch(`/api/admin/deposits?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setDeposits(json.deposits || []);
        if (json.stats) setDepositStats(json.stats);
        if (Array.isArray(json.categories)) setCategories(json.categories);
      }
    } catch (err) {
      console.error("Gagal memuat data setoran Gmail:", err);
    } finally {
      setIsLoadingDeposits(false);
    }
  }, [depositCategoryFilter, depositStatusFilter, depositSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDeposits();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchDeposits]);

  const handleUpdateDepositStatus = async (item: any, newStatus: string, customNote?: string) => {
    setIsUpdatingDeposit(true);
    try {
      const res = await adminFetch("/api/admin/deposits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          newStatus,
          adminNote: customNote !== undefined ? customNote : depositAdminNote,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setDepositModalOpen(false);
        setSelectedDeposit(null);
        setDepositAdminNote("");
        fetchDeposits();
      } else {
        alert(json.error || "Gagal mengubah status setoran Gmail");
      }
    } catch (err: any) {
      alert(err?.message || "Terjadi kesalahan");
    } finally {
      setIsUpdatingDeposit(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedGmailId(id);
      setTimeout(() => setCopiedGmailId(null), 2000);
    }
  };

  const handleCopyPassword = (text: string, id: string, gmail?: string) => {
    if (navigator?.clipboard && text && text !== "-") {
      navigator.clipboard.writeText(text);
      logAdminCredentialAction("COPY_PASSWORD", id, gmail);
      setCopiedPasswordId(id);
      setTimeout(() => setCopiedPasswordId(null), 2000);
    }
  };

  const handleCopySecret = (text: string, id: string, gmail?: string) => {
    if (navigator?.clipboard && text && text !== "-") {
      navigator.clipboard.writeText(text);
      logAdminCredentialAction("COPY_SECRET", id, gmail);
      setCopiedSecretId(id);
      setTimeout(() => setCopiedSecretId(null), 2000);
    }
  };

  const handleCopyContact = (text: string, id: string, gmail?: string) => {
    if (navigator?.clipboard && text && text !== "-") {
      navigator.clipboard.writeText(text);
      logAdminCredentialAction("COPY_CONTACT", id, gmail);
      setCopiedContactId(id);
      setTimeout(() => setCopiedContactId(null), 2000);
    }
  };

  const isPendingStatus = (s?: string) => isPendingDepositStatus(s);
  const isProblematicStatus = (s?: string) => isIssueDepositStatus(s);

  const freshCatPrice = categories.find((c) => c.id === "good")?.price || 1500;
  const bebasCatPrice = categories.find((c) => c.id === "bebas")?.price || 1000;

  return (
    <div className="space-y-6">
      {/* Header bar for Gmails */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Mail className="w-5 h-5 text-emerald-400" />
            Daftar Setoran Gmail & Email Diterima Admin
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Pantau dan verifikasi akun Gmail yang telah dibuat dan disetor pengguna, status penerimaan, dan pencairan saldo reward.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchDeposits()}
            isLoading={isLoadingDeposits}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDeposits ? "animate-spin" : ""}`} />
            <span>Refresh Gmail</span>
          </Button>
        </div>
      </div>

      {/* 5 KPI Summary Cards for Gmail Submissions - Centered Text & Numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Setoran */}
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-sm flex flex-col items-center justify-center text-center hover:border-zinc-700/80 transition-all col-span-2 sm:col-span-1">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-2 shadow-sm">
            <Mail className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Total Setoran</span>
          <div className="text-2xl font-black text-white tracking-tight mt-1">
            {depositStats.total.toLocaleString("id-ID")}
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">Semua akun Gmail disetor</p>
        </div>

        {/* Diterima (Approved) */}
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-sm flex flex-col items-center justify-center text-center hover:border-zinc-700/80 transition-all">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2 shadow-sm">
            <CheckCircle className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Diterima (Approved)</span>
          <div className="text-2xl font-black text-emerald-400 tracking-tight mt-1">
            {depositStats.accepted.toLocaleString("id-ID")}
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">Tervalidasi & Reward Cair</p>
        </div>

        {/* Menunggu Cek */}
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-sm flex flex-col items-center justify-center text-center hover:border-zinc-700/80 transition-all">
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mb-2 shadow-sm">
            <Clock className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Menunggu Cek</span>
          <div className="text-2xl font-black text-sky-400 tracking-tight mt-1">
            {depositStats.pending.toLocaleString("id-ID")}
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">Dalam antrean cek</p>
        </div>

        {/* Butuh Tindakan / Bermasalah */}
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-sm flex flex-col items-center justify-center text-center hover:border-amber-500/40 transition-all">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 flex items-center justify-center mb-2 shadow-sm">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Butuh Tindakan</span>
          <div className="text-2xl font-black text-amber-400 tracking-tight mt-1">
            {(depositStats.problematic || 0).toLocaleString("id-ID")}
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">2FA / Captcha / Verif HP</p>
        </div>

        {/* Reward Diberikan */}
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-sm flex flex-col items-center justify-center text-center hover:border-zinc-700/80 transition-all">
          <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mb-2 shadow-sm">
            <Wallet className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Reward Diberikan</span>
          <div className="text-2xl font-black text-emerald-400 font-mono tracking-tight mt-1">
            Rp {depositStats.totalAmount.toLocaleString("id-ID")}
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">Total saldo reward masuk</p>
        </div>
      </div>

      {/* Filter Kategori & Pencarian (Pencarian ditaruh dibawah kategori) */}
      <div className="space-y-3">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto no-scrollbar flex-wrap sm:flex-nowrap w-full sm:w-max">
          {[
            { label: "Semua Kategori", value: "all" },
            { label: `Gmail Fresh (Rp ${Number(freshCatPrice).toLocaleString("id-ID")})`, value: "good" },
            { label: `Gmail Lama / Bebas (Rp ${Number(bebasCatPrice).toLocaleString("id-ID")})`, value: "bebas" },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setDepositCategoryFilter(tab.value)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${depositCategoryFilter === tab.value
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search and Status filter - Diletakkan di bawah pilih kategori */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-center w-full">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-zinc-400" />
            <input
              type="text"
              placeholder="Cari alamat Gmail disetor, nama penyetor, email, atau nomor DANA..."
              value={depositSearch}
              onChange={(e) => setDepositSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>

          <select
            value={depositStatusFilter}
            onChange={(e) => setDepositStatusFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 w-full sm:w-auto"
          >
            <option value="all">Semua Status ({depositStats.total})</option>
            <option value="pending">Menunggu Cek ({depositStats.pending})</option>
            <option value="problematic">Butuh Tindakan ({depositStats.problematic || 0})</option>
            <option value="need_2fa">↳ Butuh 2FA</option>
            <option value="need_phone_verify">↳ Butuh Verifikasi HP</option>
            <option value="captcha_checkpoint">↳ Terkena Captcha</option>
            <option value="unknown">↳ Tidak Diketahui</option>
            <option value="accepted">Diterima ({depositStats.accepted})</option>
            <option value="rejected">Ditolak ({depositStats.rejected})</option>
          </select>
        </div>
      </div>

      {/* Gmails Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-950/80 border-b border-zinc-800 text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4 whitespace-nowrap">Tanggal Setor</th>
                <th className="py-3 px-4 whitespace-nowrap">Akun Gmail Disetor</th>
                <th className="py-3 px-4 whitespace-nowrap">Password</th>
                <th className="py-3 px-4 whitespace-nowrap">Penyetor (Member)</th>
                <th className="py-3 px-4 whitespace-nowrap">Secret Code Google</th>
                <th className="py-3 px-4 whitespace-nowrap">OTP 2FA</th>
                <th className="py-3 px-4 whitespace-nowrap">Kontak TG / WA</th>
                <th className="py-3 px-4 whitespace-nowrap">Kategori</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Reward</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">Status</th>
                <th className="py-3 px-4 whitespace-nowrap">Catatan</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Aksi Verifikasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
              {isLoadingDeposits ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-zinc-500">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
                      <span>Memuat data setoran Gmail...</span>
                    </div>
                  </td>
                </tr>
              ) : deposits.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-zinc-500">
                    <div className="flex flex-col items-center gap-2 max-w-sm mx-auto">
                      <Mail className="w-8 h-8 text-zinc-600" />
                      <p className="font-medium text-zinc-400">Belum ada akun Gmail yang disetor</p>
                      <p className="text-[11px] text-zinc-600">
                        Data setoran akun Gmail dari pengguna melalui website setorgmail.com akan otomatis tampil dan bisa diverifikasi di sini.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                deposits.map((dep) => (
                  <tr key={dep.id} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="py-3 px-4 text-zinc-400 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-zinc-500" />
                        <span>
                          {new Date(dep.created_at).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono font-medium text-zinc-100">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400">{dep.gmail}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(dep.gmail, dep.id)}
                          title="Salin Gmail"
                          className="text-zinc-500 hover:text-zinc-200 transition-colors p-1 rounded hover:bg-zinc-800 cursor-pointer"
                        >
                          {copiedGmailId === dep.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <KeyRound className="w-3 h-3 text-sky-400 shrink-0" />
                        <MaskedPasswordCell
                          password={dep.password}
                          depositId={dep.id}
                          gmail={dep.gmail}
                          toneClass="text-sky-300"
                        />
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-medium text-zinc-200">{dep.user_name}</div>
                      <div className="text-[11px] text-zinc-500">
                        {dep.user_email} • DANA: {dep.user_dana}
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono whitespace-nowrap">
                      {dep.totp_secret && dep.totp_secret !== "-" ? (
                        <button
                          type="button"
                          onClick={() => openDepositModal(dep)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/25 bg-zinc-950/90 hover:bg-zinc-900 px-2.5 py-1 text-xs text-indigo-300 cursor-pointer"
                          title="Secret Code disembunyikan. Klik untuk buka detail."
                        >
                          <span className="tracking-widest">••••••••</span>
                        </button>
                      ) : (
                        <span className="text-zinc-500">-</span>
                      )}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      {dep.totp_secret && dep.totp_secret !== "-" ? (
                        <button
                          type="button"
                          onClick={() => openDepositModal(dep)}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-950/30 hover:bg-amber-950/50 px-2.5 py-1 text-[11px] font-semibold text-amber-300 cursor-pointer transition-colors"
                          title="Buka detail untuk melihat OTP 2FA"
                        >
                          <span>2FA • Buka Detail</span>
                        </button>
                      ) : (
                        <span className="text-zinc-500">-</span>
                      )}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      {dep.contact_info && dep.contact_info !== "-" ? (
                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-300 font-mono">
                          <button
                            type="button"
                            onClick={() => openDepositModal(dep)}
                            className="font-semibold hover:text-cyan-200 cursor-pointer"
                            title="Klik Detail untuk melihat kontak penuh"
                          >
                            {maskContactValue(dep.contact_info)}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyContact(dep.contact_info, dep.id, dep.gmail)}
                            title="Salin Kontak Telegram / WA"
                            className="text-zinc-400 hover:text-white transition-colors p-0.5 rounded hover:bg-zinc-800 cursor-pointer"
                          >
                            {copiedContactId === dep.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-zinc-500">-</span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${dep.category_id === "good"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                          }`}
                      >
                        {dep.category_label}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                      Rp {Number(dep.amount).toLocaleString("id-ID")}
                    </td>

                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {(() => {
                        const statusInfo = getDepositStatusAdminMeta(dep.status);
                        return (
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${statusInfo.badgeClass}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`} />
                            {statusInfo.label}
                          </span>
                        );
                      })()}
                    </td>

                    <td className="py-3 px-4 max-w-xs text-zinc-400 truncate">
                      {dep.note || "-"}
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {isPendingStatus(dep.status) || isProblematicStatus(dep.status) ? (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openDepositModal(dep)}
                              className="px-2 py-1 text-[11px] text-zinc-300"
                            >
                              Detail
                            </Button>
                            <Button
                              variant="success"
                              size="sm"
                              disabled={isUpdatingDeposit}
                              onClick={() => handleUpdateDepositStatus(dep, "accepted", "Disetujui Admin")}
                              className="px-2 py-1 text-[11px] flex items-center gap-1"
                            >
                              <CheckCircle className="w-3 h-3" />
                              <span>Terima</span>
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={isUpdatingDeposit}
                              onClick={() => openDepositModal(dep)}
                              className="px-2 py-1 text-[11px] flex items-center gap-1"
                            >
                              <XCircle className="w-3 h-3" />
                              <span>Tolak</span>
                            </Button>
                            {isProblematicStatus(dep.status) && (
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={isUpdatingDeposit}
                                onClick={() =>
                                  handleUpdateDepositStatus(
                                    dep,
                                    "pending",
                                    "Direset ke Pending oleh Admin"
                                  )
                                }
                                title="Kembalikan status ke Pending untuk dicek ulang"
                                className="px-2 py-1 text-[11px] flex items-center gap-1 text-sky-300 border-sky-500/30 hover:text-white"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Reset ke Pending</span>
                              </Button>
                            )}
                          </>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openDepositModal(dep)}
                            className="px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
                          >
                            Detail
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail & Verification Modal for Gmail Deposit */}
      <Modal
        isOpen={depositModalOpen}
        onClose={() => setDepositModalOpen(false)}
        title="Rincian & Verifikasi Setoran Gmail"
        subtitle={`ID: ${selectedDeposit?.id || "-"}`}
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="text-xs text-zinc-500">
              Kategori: <span className="font-semibold text-emerald-400">{selectedDeposit?.category_label}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => setDepositModalOpen(false)}
                disabled={isUpdatingDeposit}
              >
                Tutup
              </Button>
              {(isPendingStatus(selectedDeposit?.status) ||
                isProblematicStatus(selectedDeposit?.status)) && (
                  <>
                    {isProblematicStatus(selectedDeposit?.status) && (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          handleUpdateDepositStatus(
                            selectedDeposit,
                            "pending",
                            depositAdminNote.trim() || "Direset ke Pending oleh Admin"
                          )
                        }
                        isLoading={isUpdatingDeposit}
                        className="flex items-center gap-1 text-sky-300 border-sky-500/30"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset ke Pending</span>
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      onClick={() => handleUpdateDepositStatus(selectedDeposit, "rejected")}
                      isLoading={isUpdatingDeposit}
                    >
                      Tolak Setoran
                    </Button>
                    <Button
                      variant="success"
                      onClick={() =>
                        handleUpdateDepositStatus(
                          selectedDeposit,
                          "accepted",
                          depositAdminNote.trim() || "Disetujui Admin"
                        )
                      }
                      isLoading={isUpdatingDeposit}
                    >
                      Terima & Tambah Saldo
                    </Button>
                  </>
                )}
            </div>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-500">Akun Gmail:</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-emerald-400 text-sm select-all">
                  {selectedDeposit?.gmail}
                </span>
                {selectedDeposit?.gmail && (
                  <button
                    type="button"
                    onClick={() => handleCopy(selectedDeposit.gmail, `modal-${selectedDeposit.id}`)}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                    title="Salin Gmail"
                  >
                    {copiedGmailId === `modal-${selectedDeposit.id}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-500">Password Akun:</span>
              {selectedDeposit?.password && selectedDeposit.password !== "-" ? (
                <div className="flex items-center gap-1.5">
                  <span
                    className={`font-mono font-bold text-sm ${
                      showModalPassword ? "text-sky-300 select-all" : "text-zinc-400 tracking-widest"
                    }`}
                  >
                    {showModalPassword ? selectedDeposit.password : "••••••••"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !showModalPassword;
                      setShowModalPassword(next);
                      if (next && selectedDeposit?.id) {
                        logAdminCredentialAction("REVEAL_PASSWORD", selectedDeposit.id, selectedDeposit.gmail);
                      }
                    }}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                    title={showModalPassword ? "Sembunyikan Password" : "Tampilkan Password"}
                  >
                    {showModalPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyPassword(selectedDeposit.password, `modal-${selectedDeposit.id}`, selectedDeposit.gmail)
                    }
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                    title="Salin Password"
                  >
                    {copiedPasswordId === `modal-${selectedDeposit.id}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ) : (
                <span className="text-zinc-500">-</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-500">Secret Code Google:</span>
              {selectedDeposit?.totp_secret && selectedDeposit.totp_secret !== "-" ? (
                <div className="flex items-center gap-1.5">
                  <span
                    className={`font-mono font-bold text-xs ${
                      showModalSecret ? "text-indigo-300 select-all" : "text-zinc-400 tracking-widest"
                    }`}
                  >
                    {showModalSecret ? selectedDeposit.totp_secret : "••••••••••••"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !showModalSecret;
                      setShowModalSecret(next);
                      if (next && selectedDeposit?.id) {
                        logAdminCredentialAction("REVEAL_SECRET", selectedDeposit.id, selectedDeposit.gmail);
                      }
                    }}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                    title={showModalSecret ? "Sembunyikan Secret Code" : "Tampilkan Secret Code"}
                  >
                    {showModalSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopySecret(selectedDeposit.totp_secret, `modal-${selectedDeposit.id}`, selectedDeposit.gmail)
                    }
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                    title="Salin Secret Code"
                  >
                    {copiedSecretId === `modal-${selectedDeposit.id}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ) : (
                <span className="text-zinc-500">-</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-500">OTP 2FA Live:</span>
              {selectedDeposit?.totp_secret && selectedDeposit.totp_secret !== "-" ? (
                showModalOtp ? (
                  <AdminLiveOtpCell
                    secret={selectedDeposit.totp_secret}
                    onCopy={() => {
                      if (selectedDeposit?.id) {
                        logAdminCredentialAction("COPY_OTP", selectedDeposit.id, selectedDeposit.gmail);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShowModalOtp(true);
                      if (selectedDeposit?.id) {
                        logAdminCredentialAction("REVEAL_OTP", selectedDeposit.id, selectedDeposit.gmail);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/35 bg-amber-950/40 hover:bg-amber-950/70 px-2.5 py-1 text-[11px] font-bold text-amber-300 cursor-pointer"
                  >
                    <Eye className="w-3 h-3" />
                    <span>Tampilkan OTP Live</span>
                  </button>
                )
              ) : (
                <span className="text-zinc-500">-</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-500">Kontak Telegram / WA:</span>
              {selectedDeposit?.contact_info && selectedDeposit.contact_info !== "-" ? (
                <div className="flex items-center gap-1.5">
                  <span
                    className={`font-mono font-bold text-xs ${
                      showModalContact ? "text-cyan-300 select-all" : "text-zinc-300"
                    }`}
                  >
                    {showModalContact
                      ? selectedDeposit.contact_info
                      : maskContactValue(selectedDeposit.contact_info)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !showModalContact;
                      setShowModalContact(next);
                      if (next && selectedDeposit?.id) {
                        logAdminCredentialAction("REVEAL_CONTACT", selectedDeposit.id, selectedDeposit.gmail);
                      }
                    }}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                    title={showModalContact ? "Sembunyikan Kontak" : "Tampilkan Kontak"}
                  >
                    {showModalContact ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyContact(selectedDeposit.contact_info, `modal-${selectedDeposit.id}`, selectedDeposit.gmail)
                    }
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                    title="Salin Kontak"
                  >
                    {copiedContactId === `modal-${selectedDeposit.id}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ) : (
                <span className="text-zinc-500">-</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Penyetor (Member):</span>
              <span className="font-semibold text-zinc-200">
                {selectedDeposit?.user_name} ({selectedDeposit?.user_email})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Nomor DANA:</span>
              <span className="font-mono text-zinc-300">{selectedDeposit?.user_dana || "-"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Reward Saldo:</span>
              <span className="font-bold text-emerald-400 font-mono text-sm">
                Rp {Number(selectedDeposit?.amount || 0).toLocaleString("id-ID")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Status Saat Ini:</span>
              {(() => {
                const modalStatusInfo = getDepositStatusAdminMeta(selectedDeposit?.status);
                return (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${modalStatusInfo.badgeClass}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${modalStatusInfo.dotClass}`} />
                    {modalStatusInfo.label}
                  </span>
                );
              })()}
            </div>
          </div>

          <div>
            <Textarea
              label="Catatan Admin / Alasan"
              placeholder="Contoh: Email valid & password sesuai / Password salah"
              value={depositAdminNote}
              onChange={(e) => setDepositAdminNote(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
