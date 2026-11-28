"use client";

import React from "react";
import { AdminGuard } from "@/components/admin/layout/admin-guard";
import { Header } from "@/components/admin/layout/header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminGuard>
      <div className="min-h-screen w-full max-w-[100vw] overflow-x-clip bg-zinc-950 flex flex-col">
        {/* Top Header with Status Integrasi & Tautan Cepat */}
        <Header />

        {/* Content area */}
        <main className="flex-1 p-2.5 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto pb-10 min-w-0 overflow-x-clip">
          {children}
        </main>
      </div>
    </AdminGuard>
  );
}
