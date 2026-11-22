import { z } from "zod";

/* ------------------------------------------------------------------ */
/* 1. User Facing Schemas                                             */
/* ------------------------------------------------------------------ */

export const gmailSyntaxSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9.]+@(gmail\.com|googlemail\.com)$/,
    "Format email tidak valid atau bukan domain @gmail.com"
  )
  .refine(
    (val) => {
      const local = val.split("@")[0];
      return !local.startsWith(".") && !local.endsWith(".") && !local.includes("..");
    },
    { message: "Titik tidak boleh di awal, di akhir, atau berurutan" }
  );

export const depositSubmissionSchema = z.object({
  emails: z.array(z.string().email()).min(1, "Minimal harus ada 1 email"),
  notes: z.string().max(500).optional(),
});

export const eWalletNumberSchema = z
  .string()
  .trim()
  .regex(/^08[0-9]{8,12}$/, "Nomor E-Wallet harus diawali 08 dan berjumlah 10-14 digit");

export const withdrawalRequestSchema = z.object({
  amount: z.number().int().min(5000, "Nominal penarikan minimal Rp5.000"),
  wallet_type: z.enum(["DANA", "GOPAY", "OVO", "SHOPEEPAY"]),
  wallet_number: eWalletNumberSchema,
  account_name: z.string().min(2).max(100),
});

export const supportTicketSchema = z.object({
  category: z.string().min(2).max(50),
  subject: z.string().min(3).max(100),
  description: z.string().min(10).max(2000),
  attachment_url: z.string().url().optional().nullable(),
});

/* ------------------------------------------------------------------ */
/* 2. Admin Facing Schemas                                            */
/* ------------------------------------------------------------------ */

export const adminBalanceMutationSchema = z.object({
  userId: z.string().uuid("ID Pengguna tidak valid"),
  amount: z.number().int().min(1, "Nominal harus lebih dari 0"),
  type: z.enum(["credit", "debit", "set"], {
    errorMap: () => ({ message: "Tipe mutasi harus credit (+), debit (-), atau set (=)" }),
  }),
  description: z.string().min(3).max(255),
});

export const adminRoleUpdateSchema = z.object({
  userId: z.string().uuid("ID Pengguna tidak valid"),
  role: z.enum(["Admin", "User"]),
});

export const adminUserStatusSchema = z.object({
  userId: z.string().uuid("ID Pengguna tidak valid"),
  isBlocked: z.boolean(),
});

export const siteConfigSchema = z.object({
  price_per_gmail: z.number().min(0),
  price_bebas: z.number().min(0),
  min_withdrawal: z.number().min(1000),
  is_gopay_active: z.boolean().default(true),
  is_ovo_active: z.boolean().default(true),
  is_dana_active: z.boolean().default(true),
  is_shopeepay_active: z.boolean().default(true),
  tax_gopay_active: z.boolean().default(true),
  tax_gopay: z.number().min(0),
  tax_ovo_active: z.boolean().default(true),
  tax_ovo: z.number().min(0),
  tax_dana_active: z.boolean().default(false),
  tax_dana: z.number().min(0),
  tax_shopeepay_active: z.boolean().default(false),
  tax_shopeepay: z.number().min(0),
  default_password: z.string().min(4),
  rule_status: z.string().min(1),
  rule_nama: z.string().min(1),
  rule_usia: z.string().min(1),
  rule_keamanan: z.string().min(1),
  rules_detail_text: z.array(z.string()),
  hero_headline_1: z.string().min(1),
  hero_headline_2: z.string().min(1),
  hero_headline_3: z.string().min(1),
  hero_subheadline: z.string().min(1),
  platform_badge: z.string().min(1),
  badge_status_text: z.string().min(1),
  badge_status_active: z.boolean().default(true),
  marquee_text: z.string().min(1),
  whatsapp_channel_url: z.string().url(),
  telegram_admin_username: z.string().min(1),
  is_setor_active: z.boolean().default(true),
  is_checker_active: z.boolean().default(true),
  is_withdrawal_active: z.boolean().default(true),
  is_maintenance_mode: z.boolean().default(false),
  maintenance_message: z.string().default("Platform sedang dalam pemeliharaan berkala..."),
});

/* ------------------------------------------------------------------ */
/* 3. Supabase RPC Types                                              */
/* ------------------------------------------------------------------ */

export interface ProcessWithdrawalRpcParams {
  p_user_id: string;
  p_amount: number;
  p_tax: number;
  p_wallet_type: string;
  p_wallet_number: string;
  p_account_name: string;
}

export interface AtomicBalanceMutationRpcParams {
  p_user_id: string;
  p_amount: number;
  p_mutation_type: "credit" | "debit" | "set";
  p_admin_id: string;
  p_reason: string;
}

export interface ClaimReferralRpcParams {
  p_user_id: string;
  p_referral_code: string;
}

export type DepositSubmissionInput = z.infer<typeof depositSubmissionSchema>;
export type WithdrawalRequestInput = z.infer<typeof withdrawalRequestSchema>;
export type SupportTicketInput = z.infer<typeof supportTicketSchema>;
export type AdminBalanceMutationInput = z.infer<typeof adminBalanceMutationSchema>;
export type AdminRoleUpdateInput = z.infer<typeof adminRoleUpdateSchema>;
export type SiteConfigInput = z.infer<typeof siteConfigSchema>;
