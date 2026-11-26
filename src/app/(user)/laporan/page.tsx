import type { Metadata } from "next";
import { LaporanView } from "./laporan-view";

export const metadata: Metadata = {
  title: "Laporan & Bantuan",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LaporanPage() {
  return <LaporanView />;
}
