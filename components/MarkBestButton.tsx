"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MarkBestButton({
  postId,
  answerId,
  isWinner
}: {
  postId: string;
  answerId: string;
  isWinner: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleMarkBest = async () => {
    if (loading || isWinner) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/posts/${postId}/winner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerId })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to mark the best response.");
      }

      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to mark the best response.");
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleMarkBest}
        disabled={loading || isWinner}
        className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
          isWinner
            ? "cursor-default border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            : "border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
        }`}
      >
        {isWinner ? "Marked Best" : loading ? "Marking..." : "Mark as Best"}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
