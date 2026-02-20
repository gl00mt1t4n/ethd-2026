"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConsensusPanel({
    postId,
    poolTotalCents,
    answers,
    isSettled,
    ownerUsername,
    currentUsername
}: {
    postId: string;
    poolTotalCents: number;
    answers: Array<{ id: string; agentName: string }>;
    isSettled: boolean;
    ownerUsername: string | null;
    currentUsername: string | null;
}) {
    const router = useRouter();
    const [selectedAnswerId, setSelectedAnswerId] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const isOwner = Boolean(currentUsername && ownerUsername && currentUsername === ownerUsername);

    if (isSettled) {
        return (
            <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-emerald-500/20 bg-emerald-900/10 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-6 lg:px-12 py-6 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex flex-col gap-1">
                        <span className="text-xs uppercase tracking-widest text-emerald-500 font-bold">Consensus Reached</span>
                        <p className="text-sm text-slate-400">The bounty of <span className="text-white font-mono">${(poolTotalCents / 100).toFixed(2)} USDC</span> has been successfully settled.</p>
                    </div>
                    <div className="text-emerald-500 font-bold text-sm tracking-wider uppercase flex items-center gap-2">
                        <span className="material-symbols-outlined text-[20px]">check_circle</span>
                        Query Closed
                    </div>
                </div>
            </div>
        );
    }

    const handleSettle = async () => {
        if (!isOwner || !selectedAnswerId) return;
        setLoading(true);
        setError("");

        try {
            const response = await fetch(`/api/posts/${postId}/winner`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answerId: selectedAnswerId })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to settle post.");
            }

            router.refresh(); // reload to reflect settled state
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-surface-dark/95 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-6 lg:px-12 py-6 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-widest text-primary font-bold">Consensus Phase</span>
                    <p className="text-sm text-slate-400">Select the most accurate agent to release the <span className="text-white font-mono">${(poolTotalCents / 100).toFixed(2)} USDC</span> bounty.</p>
                    {!isOwner && (
                        <p className="text-xs text-slate-500">Only @{ownerUsername ?? "poster"} can finalize the winning answer.</p>
                    )}
                    {error && <span className="text-xs text-red-500 font-mono mt-1">{error}</span>}
                </div>

                {answers.length > 0 ? (
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className="relative group w-full md:w-64">
                            <select
                                value={selectedAnswerId}
                                onChange={(e) => setSelectedAnswerId(e.target.value)}
                                disabled={loading || !isOwner}
                                className="w-full bg-transparent text-white border-0 border-b border-white/20 py-2.5 pl-0 pr-8 focus:ring-0 focus:border-primary placeholder:text-slate-600 appearance-none cursor-pointer text-sm font-medium transition-colors hover:border-white/40 disabled:opacity-50"
                            >
                                <option disabled value="">Select Winning Agent...</option>
                                {answers.map(ans => (
                                    <option key={ans.id} className="bg-surface-dark text-white" value={ans.id}>
                                        {ans.agentName}
                                    </option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400 group-hover:text-primary transition-colors">
                                <span className="material-symbols-outlined text-[20px]">expand_more</span>
                            </div>
                        </div>
                        <button
                            onClick={handleSettle}
                            disabled={loading || !selectedAnswerId || !isOwner}
                            className="flex-shrink-0 bg-primary hover:bg-primary/90 text-white disabled:opacity-50 disabled:hover:bg-primary disabled:cursor-not-allowed text-sm font-bold py-2.5 px-6 rounded-full shadow-[0_0_15px_rgba(255,77,0,0.3)] hover:shadow-[0_0_25px_rgba(255,77,0,0.5)] transition-all flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined text-[18px]">
                                {loading ? 'autorenew' : 'verified'}
                            </span>
                            Confirm {loading && '...'}
                        </button>
                    </div>
                ) : (
                    <div className="text-sm text-slate-500 font-mono">Awaiting Agent Submissions...</div>
                )}
            </div>
        </div>
    );
}
