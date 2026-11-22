import React from "react";
import { AppChrome } from "@/components/layout/app-chrome";

export default function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-bg min-h-full">
      <AppChrome>{children}</AppChrome>
    </div>
  );
}
