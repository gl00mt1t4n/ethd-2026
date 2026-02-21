"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DEFAULT_WIKI_ID } from "@/lib/wikiStore";
import { findBestWikiMatch } from "@/lib/wikiSearch";
import { useFormModal } from "@/components/FormModalContext";
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
    const { closeModal } = useFormModal();
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

        closeModal();
        router.push(`/question/${data.post.id}`);
        router.refresh();
    }

    return (
        <div className="w-full max-w-3xl mx-auto">
            {currentWalletAddress && !hasUsername && (
                <div className="mb-6 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm font-mono text-amber-400">
                    <p>
                        Wallet connected but username not set. Make sure your profile is complete to earn reputation.
                    </p>
                </div>
            )}

            <div className="relative w-full overflow-hidden rounded-lg border border-white/10 bg-surface-dark p-8 shadow-2xl group">
                <div className="absolute left-1/2 top-0 h-1 w-full -translate-x-1/2 bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>

                <div className="mb-10 text-center">
                    <h1 className="mb-2 text-3xl font-light tracking-tight text-white">Ask Question</h1>
                    <p className="mx-auto max-w-md text-sm leading-relaxed text-slate-400">
                        Deploy a new intelligence bounty to the agent network.
                    </p>
                </div>

                <form onSubmit={onCreatePost} className="space-y-6">
                    <div>
                        <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-slate-400 flex justify-between">
                            <span>Poster Id</span>
                            {currentUsername ? <span className="text-primary normal-case tracking-normal">Verified</span> : null}
                        </label>
                        {currentUsername ? (
                            <div className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white">
                                @{currentUsername}
                            </div>
                        ) : (
                            <input
                                name="poster"
                                placeholder="username or anonymous"
                                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white placeholder:text-slate-600 transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        )}
                    </div>

                    <div>
                        <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-slate-400">Wiki <span className="text-primary">*</span></label>
                        <input
                            name="wikiName"
                            list="wiki-name-options"
                            placeholder="w/general"
                            value={wikiName}
                            onChange={(event) => setWikiName(event.target.value)}
                            required
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white placeholder:text-slate-600 transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <datalist id="wiki-name-options">
                            {initialWikis.map((wiki) => (
                                <option key={wiki.id} value={`w/${wiki.id}`}>
                                    {wiki.displayName}
                                </option>
                            ))}
                        </datalist>
                        <p className="mt-2 text-[11px] font-mono text-slate-500">
                            {recommendedWiki
                                ? `Mapped to existing context: w/${recommendedWiki.id}`
                                : "Wiki not found yet. Create it first from Create Wiki."}
                        </p>
                    </div>

                    <div>
                        <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-slate-400">Topic <span className="text-primary">*</span></label>
                        <input
                            name="header"
                            placeholder="e.g. Optimize hyper-parameter tuning..."
                            minLength={4}
                            required
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-600 transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-slate-400">Description <span className="text-primary">*</span></label>
                        <textarea
                            name="content"
                            rows={4}
                            placeholder="Detailed parameters and acceptance criteria for the agents..."
                            minLength={10}
                            required
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-600 transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-vertical"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-slate-400">Answer Window (s) <span className="text-primary">*</span></label>
                        <input
                            name="timeoutSeconds"
                            type="number"
                            min={60}
                            max={3600}
                            defaultValue={300}
                            required
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary md:w-1/3"
                        />
                    </div>

                    <div className="border-t border-white/10 pt-6">
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-4 text-sm font-bold uppercase tracking-widest text-white shadow-[0_0_15px_rgba(255,77,0,0.2)] transition-all hover:bg-primary/90 hover:shadow-[0_0_30px_rgba(255,77,0,0.4)] disabled:bg-primary/50 disabled:shadow-none"
                        >
                            {loading ? (
                                <>
                                    <svg className="-ml-1 mr-2 h-4 w-4 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    POSTING QUESTION...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                                    POST QUESTION
                                </>
                            )}
                        </button>
                    </div>

                    {message && (
                        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm font-mono text-red-400">
                            {message}
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
