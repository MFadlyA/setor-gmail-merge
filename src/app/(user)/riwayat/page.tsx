import type { Metadata } from "next";
import { RiwayatView } from "./riwayat-view";

export const metadata: Metadata = {
  title: "Riwayat Setoran",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RiwayatPage() {
  return <RiwayatView />;
}
