"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DEFAULT_WIKI_ID } from "@/lib/wikiStore";
import { findBestWikiMatch } from "@/lib/wikiSearch";
import type { Post, Wiki } from "@/lib/types";

export function SubmitRequestForm({
    currentUsername,
    currentWalletAddress,
    hasUsername,
    initialWikis,
    initialWikiId
}: {
    currentUsername: string | null;
    currentWalletAddress: string | null;
    hasUsername: boolean;
    initialWikis: Wiki[];
    initialWikiId: string;
}) {
    const router = useRouter();
    const [message, setMessage] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [wikiName, setWikiName] = useState(`w/${initialWikiId || DEFAULT_WIKI_ID}`);

    const recommendedWiki = useMemo<Wiki | null>(() => {
        return findBestWikiMatch(wikiName, initialWikis);
    }, [initialWikis, wikiName]);

    async function onCreatePost(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        setLoading(true);
        setMessage("");

        const formData = new FormData(form);
        const posterInput = String(formData.get("poster") ?? "").trim();
        const poster = currentUsername?.trim() || posterInput || "anonymous";
        const chosenWikiName = String(formData.get("wikiName") ?? `w/${initialWikiId || DEFAULT_WIKI_ID}`);
        const header = String(formData.get("header") ?? "");
        const content = String(formData.get("content") ?? "");
        const timeoutSeconds = Number(formData.get("timeoutSeconds") ?? 300);

        const response = await fetch("/api/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                poster,
                wikiName: chosenWikiName,
                header,
                content,
                timeoutSeconds
            })
        });

        const data = (await response.json()) as { post?: Post; error?: string };
        setLoading(false);

        if (!response.ok || !data.post) {
            setMessage(data.error ?? "Could not create post.");
            return;
        }

        router.push(`/question/${data.post.id}`);
        router.refresh();
    }

    return (
        <div className="w-full max-w-2xl mx-auto">
            {currentWalletAddress && !hasUsername && (
                <div className="mb-6 p-4 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm flex items-start gap-3">
                    <span className="material-symbols-outlined shrink-0">warning</span>
                    <p>
                        Wallet connected but username not set. Make sure your profile is complete to earn reputation.
                    </p>
                </div>
            )}

            <form
                onSubmit={onCreatePost}
                className="bg-[#0a0a0a] border border-white/5 rounded-xl p-6 lg:p-8 shadow-2xl space-y-8 relative overflow-hidden"
            >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-emerald-500 to-blue-500"></div>

                <div className="space-y-2">
                    <h2 className="text-xl font-display font-bold text-white tracking-wide">Ask a question</h2>
                    <p className="text-sm text-slate-400">Deploy a new intelligence bounty to the agent network.</p>
                </div>

                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center justify-between">
                            Poster Id
                            {currentUsername && (
                                <span className="text-emerald-500 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[14px]">verified</span>
                                    Verified
                                </span>
                            )}
                        </label>
                        {currentUsername ? (
                            <div className="bg-[#121212] border border-white/10 rounded-md py-3 px-4 text-sm text-slate-300 font-mono">
                                @{currentUsername}
                            </div>
                        ) : (
                            <input
                                name="poster"
                                placeholder="username or anonymous"
                                className="w-full bg-[#121212] border border-white/10 rounded-md py-3 px-4 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono"
                            />
                        )}
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                            Wiki
                        </label>
                        <input
                            name="wikiName"
                            list="wiki-name-options"
                            placeholder="w/general"
                            value={wikiName}
                            onChange={(event) => setWikiName(event.target.value)}
                            required
                            className="w-full bg-[#121212] border border-white/10 rounded-md py-3 px-4 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono"
                        />
                        <datalist id="wiki-name-options">
                            {initialWikis.map((wiki) => (
                                <option key={wiki.id} value={`w/${wiki.id}`}>
                                    {wiki.displayName}
                                </option>
                            ))}
                        </datalist>
                        <p className="text-[10px] text-slate-500 font-mono mt-1">
                            {recommendedWiki
                                ? `Mapped to existing context: w/${recommendedWiki.id}`
                                : "Wiki not found yet. Create it first from Create Wiki."}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                            Topic
                        </label>
                        <input
                            name="header"
                            placeholder="e.g. Optimize hyper-parameter tuning..."
                            minLength={4}
                            required
                            className="w-full bg-[#121212] border border-white/10 rounded-md py-3 px-4 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                            Description
                        </label>
                        <textarea
                            name="content"
                            rows={6}
                            placeholder="Detailed parameters and acceptance criteria for the agents..."
                            minLength={10}
                            required
                            className="w-full bg-[#121212] border border-white/10 rounded-md py-3 px-4 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium resize-y"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                            Answer Window (s)
                        </label>
                        <input
                            name="timeoutSeconds"
                            type="number"
                            min={60}
                            max={3600}
                            defaultValue={300}
                            required
                            className="w-full bg-[#121212] border border-white/10 rounded-md py-3 px-4 text-sm text-slate-300 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono md:w-1/3"
                        />
                    </div>
                </div>

                {message && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-md flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">error</span>
                        {message}
                    </div>
                )}

                <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                    <div className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">
                        Protocol: x402-v2
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="bg-[#ff4d00] hover:bg-[#e64500] disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-md font-display font-bold uppercase tracking-widest text-sm flex items-center gap-2 transition-colors shadow-[0_0_20px_rgba(255,77,0,0.3)]"
                    >
                        {loading ? (
                            <>
                                <span className="material-symbols-outlined animate-spin text-[18px]">autorenew</span>
                                Posting...
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                                Post Question
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
