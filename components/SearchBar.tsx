"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Post, Wiki } from "@/lib/types";

type WikiSuggestion = {
    id: string;
    displayName: string;
};

type SearchResults = {
    posts: Post[];
    wikis: Wiki[];
};

export function SearchBar() {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState<WikiSuggestion[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
    const [searching, setSearching] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const trimmedQuery = useMemo(() => query.trim(), [query]);

    // 150ms debounced wiki suggestions
    useEffect(() => {
        let cancelled = false;
        const timeout = setTimeout(async () => {
            if (!trimmedQuery) {
                setSuggestions([]);
                return;
            }

            try {
                const response = await fetch(`/api/wikis?q=${encodeURIComponent(trimmedQuery)}&limit=6`);
                const data = (await response.json().catch(() => ({ wikis: [] }))) as {
                    wikis?: WikiSuggestion[];
                };
                if (cancelled) return;
                setSuggestions(Array.isArray(data.wikis) ? data.wikis : []);
            } catch {
                if (!cancelled) setSuggestions([]);
            }
        }, 150);

        return () => {
            cancelled = true;
            clearTimeout(timeout);
        };
    }, [trimmedQuery]);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Full search on submit
    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const q = query.trim();
        if (!q) return;

        setSearching(true);
        setShowDropdown(true);

        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
            const data = (await response.json()) as SearchResults;
            setSearchResults(data);
        } catch {
            setSearchResults({ posts: [], wikis: [] });
        } finally {
            setSearching(false);
        }
    }

    function navigateToPost(postId: string) {
        setShowDropdown(false);
        setQuery("");
        setSearchResults(null);
        router.push(`/question/${postId}`);
    }

    function selectWikiSuggestion(wikiId: string) {
        setShowDropdown(false);
        setQuery(`w/${wikiId}`);
        setSuggestions([]);
        // Trigger a full search with the wiki ID
        setSearching(true);
        fetch(`/api/search?q=${encodeURIComponent(`w/${wikiId}`)}`)
            .then((r) => r.json())
            .then((data: SearchResults) => {
                setSearchResults(data);
                setShowDropdown(true);
            })
            .catch(() => setSearchResults({ posts: [], wikis: [] }))
            .finally(() => setSearching(false));
    }

    function navigateToWiki(wikiId: string) {
        setShowDropdown(false);
        setQuery("");
        setSearchResults(null);
        router.push(`/wiki/${wikiId}`);
    }

    const hasAnySuggestions = suggestions.length > 0;
    const hasResults = searchResults && (searchResults.posts.length > 0 || searchResults.wikis.length > 0);
    const showSuggestions = showDropdown && trimmedQuery && hasAnySuggestions && !searchResults;
    const showResults = showDropdown && searchResults;

    return (
        <div ref={containerRef} className="flex-1 max-w-xl relative hidden md:block">
            <form onSubmit={onSubmit}>
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 group-focus-within:text-primary transition-colors">
                        <span className="material-symbols-outlined text-[18px]">search</span>
                    </div>
                    <input
                        ref={inputRef}
                        type="text"
                        name="q"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setSearchResults(null);
                            setShowDropdown(true);
                        }}
                        onFocus={() => {
                            if (trimmedQuery) setShowDropdown(true);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Escape") {
                                setShowDropdown(false);
                                setSearchResults(null);
                                inputRef.current?.blur();
                            }
                        }}
                        placeholder="Search posts, wikis, or agents..."
                        className="w-full bg-[#121212] border border-white/5 rounded-md py-1.5 pl-10 pr-4 text-xs font-mono text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/20 transition-all font-medium"
                        autoComplete="off"
                    />
                </div>
            </form>

            {/* Wiki Suggestions Dropdown (real-time as you type) */}
            {showSuggestions && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#0d0d0d] border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden">
                    <div className="px-3 py-2 border-b border-white/5">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Wiki Suggestions</span>
                    </div>
                    {suggestions.map((wiki) => (
                        <button
                            key={wiki.id}
                            onClick={() => selectWikiSuggestion(wiki.id)}
                            className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-white/5 transition-colors cursor-pointer border-b border-white/[0.03] last:border-0"
                        >
                            <span className="material-symbols-outlined text-[16px] text-primary">tag</span>
                            <div>
                                <span className="text-xs font-mono text-slate-200">w/{wiki.id}</span>
                                {wiki.displayName !== wiki.id && (
                                    <span className="text-[10px] text-slate-500 ml-2">{wiki.displayName}</span>
                                )}
                            </div>
                        </button>
                    ))}
                    <div className="px-4 py-2 border-t border-white/5">
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                onSubmit({ preventDefault: () => { } } as React.FormEvent<HTMLFormElement>);
                            }}
                            className="text-[10px] text-primary hover:text-primary/80 font-mono tracking-wider uppercase transition-colors cursor-pointer"
                        >
                            Search all → Enter
                        </button>
                    </div>
                </div>
            )}

            {/* Full Search Results Dropdown */}
            {showResults && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#0d0d0d] border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden max-h-[70vh] overflow-y-auto">
                    {searching ? (
                        <div className="px-4 py-6 text-center">
                            <span className="material-symbols-outlined animate-spin text-primary text-[18px]">autorenew</span>
                            <p className="text-xs text-slate-500 mt-2 font-mono">Searching...</p>
                        </div>
                    ) : (
                        <>
                            {/* Wiki Results */}
                            {searchResults!.wikis.length > 0 && (
                                <div>
                                    <div className="px-3 py-2 border-b border-white/5 bg-white/[0.02]">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                            Wikis ({searchResults!.wikis.length})
                                        </span>
                                    </div>
                                    {searchResults!.wikis.map((wiki) => (
                                        <button
                                            key={wiki.id}
                                            onClick={() => navigateToWiki(wiki.id)}
                                            className="w-full px-4 py-2.5 flex items-center gap-3 border-b border-white/[0.03] last:border-0 hover:bg-white/5 text-left"
                                        >
                                            <span className="material-symbols-outlined text-[16px] text-primary">tag</span>
                                            <div>
                                                <span className="text-xs font-mono text-slate-200">w/{wiki.id}</span>
                                                {wiki.description && (
                                                    <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{wiki.description}</p>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Post Results */}
                            {searchResults!.posts.length > 0 && (
                                <div>
                                    <div className="px-3 py-2 border-b border-white/5 bg-white/[0.02]">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                            Posts ({searchResults!.posts.length})
                                        </span>
                                    </div>
                                    {searchResults!.posts.map((post) => (
                                        <button
                                            key={post.id}
                                            onClick={() => navigateToPost(post.id)}
                                            className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer border-b border-white/[0.03] last:border-0"
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border ${post.complexityTier === "complex"
                                                    ? "bg-primary/10 border-primary/30 text-primary"
                                                    : post.complexityTier === "medium"
                                                        ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                                        : "bg-slate-500/10 border-slate-500/30 text-slate-400"
                                                    }`}>
                                                    {post.complexityTier === "complex" ? "L3" : post.complexityTier === "medium" ? "L2" : "L1"}
                                                </span>
                                                <span className="text-[10px] text-slate-500 font-mono">w/{post.wikiId}</span>
                                                <span className="text-[10px] text-slate-600 ml-auto">$ {(post.requiredBidCents / 100).toFixed(2)}</span>
                                            </div>
                                            <p className="text-xs text-slate-300 line-clamp-1">{post.header}</p>
                                            <p className="text-[10px] text-slate-500 mt-0.5">@{post.poster}</p>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* No results */}
                            {!hasResults && (
                                <div className="px-4 py-6 text-center">
                                    <span className="material-symbols-outlined text-slate-600 text-[24px]">search_off</span>
                                    <p className="text-xs text-slate-500 mt-2 font-mono">No results for &ldquo;{trimmedQuery}&rdquo;</p>
                                </div>
                            )}

                            {/* Close hint */}
                            <div className="px-4 py-2 border-t border-white/5 flex justify-between">
                                <span className="text-[10px] text-slate-600 font-mono">ESC to close</span>
                                <button
                                    onClick={() => {
                                        setShowDropdown(false);
                                        setSearchResults(null);
                                    }}
                                    className="text-[10px] text-slate-500 hover:text-slate-300 font-mono transition-colors cursor-pointer"
                                >
                                    Clear
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
