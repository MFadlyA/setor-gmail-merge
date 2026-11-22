"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

interface GoogleButtonProps {
  onSuccess?: (credential: string) => void;
  onFallbackClick?: () => void;
  isLoading?: boolean;
}

export function GoogleButton({
  onFallbackClick,
  isLoading = false,
}: GoogleButtonProps) {
  const handleClick = () => {
    if (isLoading) return;
    if (onFallbackClick) {
      onFallbackClick();
    }
  };

  return (
    <div className="relative h-11 min-h-[44px] w-full flex items-center justify-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="flex h-11 w-full items-center justify-center gap-3 rounded-full border border-zinc-700 bg-white text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-100 active:scale-[0.99] disabled:opacity-70 cursor-pointer"
      >
        {isLoading ? (
          <Loader2 className="size-4 animate-spin text-zinc-700" />
        ) : (
          <GoogleMark />
        )}
        <span>{isLoading ? "Menghubungkan ke Google..." : "Lanjutkan dengan Google"}</span>
      </button>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58V6.61H1.28a12 12 0 0 0 0 10.78l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4 3.1C6.23 6.86 8.88 4.75 12 4.75Z"
      />
    </svg>
  );
}
