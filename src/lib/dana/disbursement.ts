import { ResponseError, FetchError } from "dana-node/runtime";
import {
  getDanaClients,
  getDanaConfig,
  jakartaNow,
  type DanaEnvironment,
} from "./client";

/**
 * Mandatory fundType for Disbursement to Balance (Customer Top Up & Account Inquiry).
 */
export const DANA_FUND_TYPE = "AGENT_TOPUP_FOR_USER_SETTLE";

/**
 * Withdrawals <= Rp10.000 are automatically disbursed to DANA upon user request.
 * Withdrawals > Rp10.000 require Admin approval before DANA disbursement is triggered.
 */
export const AUTO_DISBURSE_MAX_AMOUNT = 10_000;

/**
 * Official DANA SNAP response codes for Disbursement to Balance:
 * - Account Inquiry Success: 2003700
 * - Customer Top Up Success: 2003800
 * - Customer Top Up Inconsistent Request (treat as Success + verify with DANA): 4043818
 */
export const DANA_INQUIRY_SUCCESS_CODE = "2003700";
export const DANA_TOPUP_SUCCESS_CODE = "2003800";
export const DANA_TOPUP_INCONSISTENT_SUCCESS_CODE = "4043818";

const UNCERTAIN_TOPUP_CODES = new Set([
  "5003801", // Internal Server Error -> hold funds & check status
  "4293800", // Too Many Requests -> hold funds & check status
  "5043800", // Timeout
]);

/**
 * Normalizes Indonesian phone number (`08xxx`, `+628xxx`, `628xxx`) into `628xxx` required by DANA.
 */
export function to628PhoneNumber(phone: string): string {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  if (digits.startsWith("08")) {
    return "62" + digits.slice(1);
  }
  if (digits.startsWith("628")) {
    return digits;
  }
  if (digits.startsWith("8")) {
    return "62" + digits;
  }
  return digits;
}

/**
 * Formats integer IDR amount into DANA SNAP Money object (`"10000.00"`, `"IDR"`).
 */
export function formatDanaMoney(amountIdr: number): { value: string; currency: string } {
  const clean = Math.max(0, Math.floor(Number(amountIdr) || 0));
  return {
    value: `${clean}.00`,
    currency: "IDR",
  };
}

/**
 * Parses DANA SNAP Money object (`{ value: "10000.00", currency: "IDR" }`) to integer IDR.
 */
export function parseDanaMoneyValue(money?: { value?: string | number } | null): number {
  if (!money || money.value === undefined || money.value === null) return 0;
  const parsed = Number.parseFloat(String(money.value));
  return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
}

/**
 * Generates a unique, traceable `partnerReferenceNo` (max 64 chars) suitable as DANA idempotency key.
 */
export function generatePartnerReferenceNo(
  prefix: "INQ" | "WD",
  seedId?: string
): string {
  const cleanSeed = String(seedId || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 24);
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return cleanSeed
    ? `${prefix}-${cleanSeed}-${ts}`.slice(0, 64)
    : `${prefix}-${ts}-${rand}`.slice(0, 64);
}

/**
 * Extracts structured `{ responseCode, responseMessage, httpStatus, isTimeoutOrNetwork }`
 * from any error thrown by `dana-node`.
 */
function parseDanaSdkError(err: unknown): {
  responseCode: string;
  responseMessage: string;
  httpStatus: number;
  isTimeoutOrNetwork: boolean;
} {
  if (err instanceof ResponseError) {
    const raw = (err as ResponseError & { rawResponse?: Record<string, unknown> }).rawResponse;
    const code =
      (raw && typeof raw === "object" && typeof raw.responseCode === "string" && raw.responseCode) ||
      String((err as ResponseError & { errorCode?: string }).errorCode || "") ||
      `HTTP_${err.status || 500}`;
    const msg =
      (raw && typeof raw === "object" && typeof raw.responseMessage === "string" && raw.responseMessage) ||
      String((err as ResponseError & { errorMessage?: string }).errorMessage || err.message || "DANA API error");
    const status = Number(err.status) || 500;
    const isGatewayTimeout = status === 502 || status === 503 || status === 504 || status === 408;
    return {
      responseCode: code,
      responseMessage: msg,
      httpStatus: status,
      isTimeoutOrNetwork: isGatewayTimeout,
    };
  }

  if (err instanceof FetchError) {
    return {
      responseCode: "NETWORK_TIMEOUT",
      responseMessage: err.message || "Koneksi ke server DANA terputus / timeout.",
      httpStatus: 504,
      isTimeoutOrNetwork: true,
    };
  }

  const msg = err instanceof Error ? err.message : String(err || "Unknown DANA error");
  const isNet = /timeout|abort|network|fetch|econnreset|etimedout/i.test(msg);
  return {
    responseCode: isNet ? "NETWORK_TIMEOUT" : "SDK_ERROR",
    responseMessage: msg,
    httpStatus: isNet ? 504 : 500,
    isTimeoutOrNetwork: isNet,
  };
}

/**
 * Maps DANA SNAP response codes into clean Indonesian user/admin messages.
 * NEVER exposes raw English DANA `responseMessage` (e.g. "Do Not Honor") as the primary message.
 */
export function getFriendlyDanaErrorMessage(code: string): string {
  switch (code) {
    case "4003700":
    case "4003701":
    case "4003702":
    case "4003800":
    case "4003801":
    case "4003802":
      return "Format nomor atau nominal penarikan DANA tidak sesuai. Periksa kembali nomor tujuan Anda.";
    case "4013700":
    case "4013701":
    case "4013800":
    case "4013801":
      return "Layanan verifikasi DANA sedang mengalami gangguan koneksi. Silakan coba beberapa saat lagi.";
    case "4033701":
    case "4033801":
    case "4033715":
    case "4033815":
      return "Transaksi tidak diizinkan untuk akun DANA tujuan ini.";
    case "4033702":
    case "4033802":
    case "4033704":
    case "4033804":
      return "Nominal melebihi batas limit saldo atau transaksi bulanan akun DANA penerima.";
    case "4033703":
    case "4033803":
      return "Transaksi ditolak oleh sistem keamanan DANA.";
    case "4033705":
    case "4033805":
      // SNAP "Do Not Honor" (4033705 on Account Inquiry / 4033805 on Customer Top Up)
      return "Nomor DANA tujuan ditolak oleh sistem DANA. Pastikan nomor terdaftar aktif di DANA dan dapat menerima saldo.";
    case "4033718":
    case "4033818":
      return "Akun DANA tujuan tidak aktif atau sedang dibekukan.";
    case "4043711":
    case "4043712":
    case "4043811":
    case "4043812":
      return "Nomor DANA tidak ditemukan atau belum terdaftar di aplikasi DANA.";
    case "4033714":
    case "4033814":
      return "Saldo sistem pencairan DANA sedang dalam pengisian ulang. Silakan coba beberapa saat lagi.";
    case "4033720":
    case "4033820":
      return "Batas kuota transaksi harian sistem DANA telah tercapai. Silakan coba kembali nanti.";
    case "4293700":
    case "4293800":
      return "Terlalu banyak permintaan ke server DANA. Silakan tunggu sebentar.";
    case "5003700":
    case "5003701":
    case "5003800":
    case "5003801":
    case "5043700":
    case "5043800":
    case "NETWORK_TIMEOUT":
      return "Server DANA sedang sibuk atau mengalami gangguan sementara. Silakan coba beberapa saat lagi.";
    default:
      return "Permintaan ke akun DANA tujuan belum dapat diproses saat ini. Pastikan nomor DANA aktif atau coba beberapa saat lagi.";
  }
}

/* ------------------------------------------------------------------ */
/* 1. Check Disbursement Account (MDA Balance)                        */
/* ------------------------------------------------------------------ */

export interface MdaBalanceResult {
  ok: boolean;
  env: DanaEnvironment;
  balanceIdr: number | null;
  availableBalanceIdr: number | null;
  resultCode: string;
  resultMsg: string;
  rawResources?: Array<{ resourceType: string; value: string }>;
}

function parseMerchantResourceMoneyIdr(rawVal: unknown): number | null {
  if (rawVal === null || rawVal === undefined) return null;
  try {
    const obj = typeof rawVal === "string" ? JSON.parse(rawVal) : rawVal;
    if (obj && typeof obj === "object") {
      if ("value" in obj && obj.value !== undefined) {
        const v = Number.parseFloat(String((obj as { value: unknown }).value));
        if (Number.isFinite(v)) return Math.floor(v);
      }
      if ("amount" in obj && obj.amount !== undefined) {
        const amtStr = String((obj as { amount: unknown }).amount).trim();
        if (amtStr.includes(".")) {
          const v = Number.parseFloat(amtStr);
          if (Number.isFinite(v)) return Math.floor(v);
        } else {
          // DANA OpenAPI v2.0 MoneyView stores `amount` in minor units (cents = IDR * 100)
          const cents = Number(amtStr);
          if (Number.isFinite(cents)) return Math.floor(cents / 100);
        }
      }
    }
  } catch {
    const direct = Number.parseFloat(String(rawVal));
    if (Number.isFinite(direct)) return Math.floor(direct);
  }
  return null;
}

export async function checkMdaBalance(): Promise<MdaBalanceResult> {
  const cfg = getDanaConfig();
  if (!cfg.isConfigured) {
    return {
      ok: false,
      env: cfg.env,
      balanceIdr: null,
      availableBalanceIdr: null,
      resultCode: "NOT_CONFIGURED",
      resultMsg: "Kredensial API DANA belum dikonfigurasi di environment server.",
    };
  }

  if (!cfg.merchantId) {
    return {
      ok: false,
      env: cfg.env,
      balanceIdr: null,
      availableBalanceIdr: null,
      resultCode: "NO_MERCHANT_ID",
      resultMsg: "DANA_MERCHANT_ID belum diisi (opsional untuk cek saldo MDA).",
    };
  }

  try {
    const { merchantManagementApi } = getDanaClients();
    const res = await Promise.race([
      merchantManagementApi.queryMerchantResource({
        requestMerchantId: cfg.merchantId,
        merchantResourceInfoList: [
          "MERCHANT_DEPOSIT_BALANCE",
          "MERCHANT_AVAILABLE_BALANCE",
        ],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout saat memeriksa saldo MDA DANA")), 10_000)
      ),
    ]);

    const body = res?.response?.body;
    const resultInfo = body?.resultInfo;
    const isSuccess = resultInfo?.resultStatus === "S";
    const list = body?.merchantResourceInformations || [];

    let depositBal: number | null = null;
    let availableBal: number | null = null;

    for (const item of list) {
      if (item.resourceType === "MERCHANT_DEPOSIT_BALANCE") {
        depositBal = parseMerchantResourceMoneyIdr(item.value);
      } else if (item.resourceType === "MERCHANT_AVAILABLE_BALANCE") {
        availableBal = parseMerchantResourceMoneyIdr(item.value);
      }
    }

    return {
      ok: isSuccess,
      env: cfg.env,
      balanceIdr: depositBal ?? availableBal,
      availableBalanceIdr: availableBal,
      resultCode: resultInfo?.resultCode || (isSuccess ? "SUCCESS" : "UNKNOWN"),
      resultMsg: resultInfo?.resultMsg || "",
      rawResources: list.map((i) => ({ resourceType: String(i.resourceType), value: String(i.value) })),
    };
  } catch (err) {
    const parsed = parseDanaSdkError(err);
    return {
      ok: false,
      env: cfg.env,
      balanceIdr: null,
      availableBalanceIdr: null,
      resultCode: parsed.responseCode,
      resultMsg: parsed.responseMessage,
    };
  }
}

/* ------------------------------------------------------------------ */
/* 2. DANA Account Inquiry                                            */
/* ------------------------------------------------------------------ */

export interface DanaInquiryResult {
  ok: boolean;
  responseCode: string;
  responseMessage: string;
  friendlyError?: string;
  partnerReferenceNo: string;
  referenceNo?: string;
  sessionId?: string;
  customerNumber: string;
  customerName: string;
  minAmountIdr: number;
  maxAmountIdr: number;
  feeAmountIdr: number;
  monthlyInLimit?: string;
}

export async function inquireDanaAccount(params: {
  phoneNumber: string;
  amountIdr: number;
  partnerReferenceNo?: string;
}): Promise<DanaInquiryResult> {
  const partnerRef = params.partnerReferenceNo || generatePartnerReferenceNo("INQ");
  const customerNumber = to628PhoneNumber(params.phoneNumber);

  try {
    const { disbursementApi, snapOverride } = getDanaClients();
    const res = await disbursementApi.danaAccountInquiry(
      {
        partnerReferenceNo: partnerRef,
        customerNumber,
        amount: formatDanaMoney(params.amountIdr),
        transactionDate: jakartaNow(),
        additionalInfo: {
          fundType: DANA_FUND_TYPE,
        },
      },
      snapOverride
    );

    const code = String(res.responseCode || "");
    const ok = code === DANA_INQUIRY_SUCCESS_CODE;
    if (!ok) {
      console.warn("[DANA_INQUIRY_REJECTED]", {
        partnerReferenceNo: partnerRef,
        responseCode: code,
        responseMessage: res.responseMessage || "",
      });
    }

    return {
      ok,
      responseCode: code,
      responseMessage: res.responseMessage || "",
      friendlyError: ok ? undefined : getFriendlyDanaErrorMessage(code),
      partnerReferenceNo: res.partnerReferenceNo || partnerRef,
      referenceNo: res.referenceNo,
      sessionId: res.sessionId,
      customerNumber: res.customerNumber || customerNumber,
      customerName: res.customerName || "",
      minAmountIdr: parseDanaMoneyValue(res.minAmount),
      maxAmountIdr: parseDanaMoneyValue(res.maxAmount),
      feeAmountIdr: parseDanaMoneyValue(res.feeAmount),
      monthlyInLimit: res.customerMonthlyInLimit,
    };
  } catch (err) {
    const parsed = parseDanaSdkError(err);
    console.warn("[DANA_INQUIRY_ERROR]", {
      partnerReferenceNo: partnerRef,
      responseCode: parsed.responseCode,
      responseMessage: parsed.responseMessage,
      httpStatus: parsed.httpStatus,
    });
    return {
      ok: false,
      responseCode: parsed.responseCode,
      responseMessage: parsed.responseMessage,
      friendlyError: getFriendlyDanaErrorMessage(parsed.responseCode),
      partnerReferenceNo: partnerRef,
      customerNumber,
      customerName: "",
      minAmountIdr: 0,
      maxAmountIdr: 0,
      feeAmountIdr: 0,
    };
  }
}

/* ------------------------------------------------------------------ */
/* 3. Customer Top Up (`transferToDana`) with Safe Idempotent Retry   */
/* ------------------------------------------------------------------ */

export type DisburseOutcome =
  | "SUCCESS"
  | "PENDING_RECONCILE"
  | "MDA_INSUFFICIENT"
  | "DEF_FAILED";

export interface DanaDisburseResult {
  outcome: DisburseOutcome;
  responseCode: string;
  responseMessage: string;
  friendlyError?: string;
  partnerReferenceNo: string;
  referenceNo?: string;
  customerName?: string;
  inconsistentFlag?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Executes DANA Customer Top Up (`transferToDana`).
 * Retries with the EXACT SAME `partnerReferenceNo` on `5003801` or network timeout
 * (up to `maxAttempts`, max 5 per official DANA spec; defaults to 3 in serverless edge).
 * If still uncertain after retries, immediately checks `queryTopUpStatus` once before returning `PENDING_RECONCILE`.
 */
export async function disburseToDana(params: {
  partnerReferenceNo: string;
  phoneNumber: string;
  amountIdr: number;
  sessionId?: string;
  notes?: string;
  maxAttempts?: number;
}): Promise<DanaDisburseResult> {
  const customerNumber = to628PhoneNumber(params.phoneNumber);
  const maxAttempts = Math.min(5, Math.max(1, params.maxAttempts ?? 3));
  const { disbursementApi, snapOverride } = getDanaClients();

  let lastCode = "UNKNOWN";
  let lastMessage = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await disbursementApi.transferToDana(
        {
          partnerReferenceNo: params.partnerReferenceNo,
          customerNumber,
          amount: formatDanaMoney(params.amountIdr),
          feeAmount: formatDanaMoney(0),
          transactionDate: jakartaNow(),
          ...(params.sessionId ? { sessionId: params.sessionId } : {}),
          notes: (params.notes || "Penarikan Saldo Setor Gmail").slice(0, 120),
          additionalInfo: {
            fundType: DANA_FUND_TYPE,
          },
        },
        snapOverride
      );

      const code = String(res.responseCode || "");
      lastCode = code;
      lastMessage = res.responseMessage || "";

      if (code === DANA_TOPUP_SUCCESS_CODE) {
        return {
          outcome: "SUCCESS",
          responseCode: code,
          responseMessage: lastMessage,
          partnerReferenceNo: res.partnerReferenceNo || params.partnerReferenceNo,
          referenceNo: res.referenceNo,
          customerName: res.customerName,
        };
      }

      // Spec A.8: 4043818 Inconsistent Request -> mark as Success, flag for DANA verification
      if (code === DANA_TOPUP_INCONSISTENT_SUCCESS_CODE) {
        return {
          outcome: "SUCCESS",
          responseCode: code,
          responseMessage: lastMessage || "Inconsistent Request — ditandai Berhasil sesuai panduan DANA",
          partnerReferenceNo: res.partnerReferenceNo || params.partnerReferenceNo,
          referenceNo: res.referenceNo,
          customerName: res.customerName,
          inconsistentFlag: true,
        };
      }

      if (code === "4033814") {
        console.warn("[DANA_TOPUP_MDA_INSUFFICIENT]", {
          partnerReferenceNo: params.partnerReferenceNo,
          responseCode: code,
          responseMessage: lastMessage,
        });
        return {
          outcome: "MDA_INSUFFICIENT",
          responseCode: code,
          responseMessage: lastMessage,
          friendlyError: getFriendlyDanaErrorMessage(code),
          partnerReferenceNo: params.partnerReferenceNo,
        };
      }

      if (UNCERTAIN_TOPUP_CODES.has(code)) {
        if (attempt < maxAttempts) {
          await sleep(attempt * 500);
          continue;
        }
        break;
      }

      // Definitive failure
      console.warn("[DANA_TOPUP_REJECTED]", {
        partnerReferenceNo: params.partnerReferenceNo,
        responseCode: code,
        responseMessage: lastMessage,
      });
      return {
        outcome: "DEF_FAILED",
        responseCode: code,
        responseMessage: lastMessage,
        friendlyError: getFriendlyDanaErrorMessage(code),
        partnerReferenceNo: params.partnerReferenceNo,
      };
    } catch (err) {
      const parsed = parseDanaSdkError(err);
      lastCode = parsed.responseCode;
      lastMessage = parsed.responseMessage;

      if (parsed.responseCode === DANA_TOPUP_INCONSISTENT_SUCCESS_CODE) {
        return {
          outcome: "SUCCESS",
          responseCode: parsed.responseCode,
          responseMessage: parsed.responseMessage,
          partnerReferenceNo: params.partnerReferenceNo,
          inconsistentFlag: true,
        };
      }

      if (parsed.responseCode === "4033814") {
        console.warn("[DANA_TOPUP_MDA_INSUFFICIENT]", {
          partnerReferenceNo: params.partnerReferenceNo,
          responseCode: parsed.responseCode,
          responseMessage: parsed.responseMessage,
        });
        return {
          outcome: "MDA_INSUFFICIENT",
          responseCode: parsed.responseCode,
          responseMessage: parsed.responseMessage,
          friendlyError: getFriendlyDanaErrorMessage(parsed.responseCode),
          partnerReferenceNo: params.partnerReferenceNo,
        };
      }

      const isUncertain =
        parsed.isTimeoutOrNetwork || UNCERTAIN_TOPUP_CODES.has(parsed.responseCode);

      if (isUncertain) {
        if (attempt < maxAttempts) {
          await sleep(attempt * 500);
          continue;
        }
        break;
      }

      // Definitive 4xx / 5003800 failure
      console.warn("[DANA_TOPUP_ERROR]", {
        partnerReferenceNo: params.partnerReferenceNo,
        responseCode: parsed.responseCode,
        responseMessage: parsed.responseMessage,
        httpStatus: parsed.httpStatus,
      });
      return {
        outcome: "DEF_FAILED",
        responseCode: parsed.responseCode,
        responseMessage: parsed.responseMessage,
        friendlyError: getFriendlyDanaErrorMessage(parsed.responseCode),
        partnerReferenceNo: params.partnerReferenceNo,
      };
    }
  }

  // Uncertain outcome after retries -> run immediate Customer Top Up Inquiry Status check
  const statusCheck = await queryTopUpStatus(params.partnerReferenceNo);
  if (statusCheck.mappedOutcome === "SUCCESS") {
    return {
      outcome: "SUCCESS",
      responseCode: statusCheck.responseCode,
      responseMessage: statusCheck.transactionStatusDesc || "Verified Success via Inquiry Status",
      partnerReferenceNo: params.partnerReferenceNo,
      referenceNo: statusCheck.originalReferenceNo,
    };
  }
  if (statusCheck.mappedOutcome === "FAILED") {
    return {
      outcome: "DEF_FAILED",
      responseCode: statusCheck.responseCode,
      responseMessage: statusCheck.transactionStatusDesc || lastMessage,
      friendlyError: "Transaksi dinyatakan gagal oleh sistem DANA.",
      partnerReferenceNo: params.partnerReferenceNo,
    };
  }

  return {
    outcome: "PENDING_RECONCILE",
    responseCode: lastCode,
    responseMessage: lastMessage || "Menunggu kepastian status dari server DANA",
    partnerReferenceNo: params.partnerReferenceNo,
  };
}

/* ------------------------------------------------------------------ */
/* 4. Customer Top Up Inquiry Status (`transferToDanaInquiryStatus`)  */
/* ------------------------------------------------------------------ */

export interface DanaTopUpStatusResult {
  ok: boolean;
  responseCode: string;
  responseMessage: string;
  latestTransactionStatus: string;
  transactionStatusDesc: string;
  originalPartnerReferenceNo: string;
  originalReferenceNo?: string;
  mappedOutcome: "SUCCESS" | "FAILED" | "PENDING" | "NOT_FOUND" | "ERROR";
}

export async function queryTopUpStatus(
  originalPartnerReferenceNo: string,
  originalReferenceNo?: string
): Promise<DanaTopUpStatusResult> {
  try {
    const { disbursementApi, snapOverride } = getDanaClients();
    const res = await disbursementApi.transferToDanaInquiryStatus(
      {
        originalPartnerReferenceNo,
        ...(originalReferenceNo ? { originalReferenceNo } : {}),
        serviceCode: "38",
      },
      snapOverride
    );

    const status = String(res.latestTransactionStatus || "");
    let mappedOutcome: DanaTopUpStatusResult["mappedOutcome"] = "PENDING";
    if (status === "00") {
      mappedOutcome = "SUCCESS";
    } else if (status === "04" || status === "05" || status === "06") {
      mappedOutcome = "FAILED";
    } else if (status === "07") {
      mappedOutcome = "NOT_FOUND";
    } else {
      // 01 Initiated, 02 Paying, 03 Pending
      mappedOutcome = "PENDING";
    }

    return {
      ok: true,
      responseCode: String(res.responseCode || ""),
      responseMessage: res.responseMessage || "",
      latestTransactionStatus: status,
      transactionStatusDesc: res.transactionStatusDesc || "",
      originalPartnerReferenceNo: res.originalPartnerReferenceNo || originalPartnerReferenceNo,
      originalReferenceNo: res.originalReferenceNo || originalReferenceNo,
      mappedOutcome,
    };
  } catch (err) {
    const parsed = parseDanaSdkError(err);
    if (parsed.responseCode === "4043901" || parsed.httpStatus === 404) {
      return {
        ok: true,
        responseCode: parsed.responseCode,
        responseMessage: parsed.responseMessage,
        latestTransactionStatus: "07",
        transactionStatusDesc: parsed.responseMessage || "Transaction Not Found",
        originalPartnerReferenceNo,
        originalReferenceNo,
        mappedOutcome: "NOT_FOUND",
      };
    }

    return {
      ok: false,
      responseCode: parsed.responseCode,
      responseMessage: parsed.responseMessage,
      latestTransactionStatus: "",
      transactionStatusDesc: parsed.responseMessage,
      originalPartnerReferenceNo,
      originalReferenceNo,
      mappedOutcome: "ERROR",
    };
  }
}
