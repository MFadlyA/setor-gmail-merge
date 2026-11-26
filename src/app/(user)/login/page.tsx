import type { Metadata } from "next";
import { LoginViewClient } from "./login-view-client";

export const metadata: Metadata = {
  title: "Masuk & Daftar | Setor Gmail by Winter",
  alternates: {
    canonical: "https://www.setorgmail.com/login",
  },
};

export default function LoginPage() {
  return <LoginViewClient />;
}
