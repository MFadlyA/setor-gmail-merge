import React from "react";
import type { Metadata } from "next";
import { AdminAuthProvider } from "@/context/admin-auth-context";

export const metadata: Metadata = {
  title: "Admin Dashboard | Setor Gmail",
  description: "Pusat Kontrol & Manajemen Administrator setorgmail.com",
};

export const dynamic = "force-dynamic";

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminAuthProvider>
      <div className="min-h-full flex flex-col bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
        {children}
      </div>
    </AdminAuthProvider>
  );
}
