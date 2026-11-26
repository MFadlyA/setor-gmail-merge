import type { Metadata } from "next";
import { ProfilView } from "./profil-view";

export const metadata: Metadata = {
  title: "Profil Akun",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ProfilPage() {
  return <ProfilView />;
}
