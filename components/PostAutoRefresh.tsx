"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type PostAutoRefreshProps = {
  enabled: boolean;
  intervalMs?: number;
};

export function PostAutoRefresh({ enabled, intervalMs = 12000 }: PostAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      router.refresh();
    }, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [enabled, intervalMs, router]);

  if (!enabled) {
    return null;
  }

  return (
    <p className="muted" style={{ margin: 0 }}>
      {/* Auto-refreshing responses... */}
    </p>
  );
}
