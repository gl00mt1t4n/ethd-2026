"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type WikiSuggestion = {
  id: string;
  displayName: string;
};

type SearchBarProps = {
  focusSignal?: number;
};

export function SearchBar({ focusSignal = 0 }: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<WikiSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(async () => {
      if (!trimmedQuery) {
        setSuggestions([]);
        return;
      }

      try {
        const response = await fetch(`/api/wikis?q=${encodeURIComponent(trimmedQuery)}&limit=6`);
        const data = (await response.json().catch(() => ({ wikis: [] }))) as { wikis?: WikiSuggestion[] };
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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!focusSignal) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSignal]);

  function navigateToSearch(q: string) {
    const value = q.trim();
    if (!value) return;
    setShowDropdown(false);
    router.push(`/search?q=${encodeURIComponent(value)}`);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigateToSearch(query);
  }

  function selectWikiSuggestion(wikiId: string) {
    const value = `w/${wikiId}`;
    setQuery(value);
    navigateToSearch(value);
  }

  const showSuggestions = showDropdown && Boolean(trimmedQuery);

  return (
    <div ref={containerRef} className="relative min-w-0 max-w-[46rem] flex-1">
      <form onSubmit={onSubmit}>
        <div className="group relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 transition-colors group-focus-within:text-primary">
            <span className="ascii-glyph text-[11px]">{"[?]"}</span>
          </div>
          <input
            ref={inputRef}
            type="text"
            name="q"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => {
              if (trimmedQuery) setShowDropdown(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setShowDropdown(false);
                inputRef.current?.blur();
              }
            }}
            placeholder="Search (wiki suggestions while typing)"
            className="w-full rounded-[5px] border-2 border-white/70 bg-[#212121] py-2 pl-10 pr-4 text-[13px] font-medium text-slate-200 placeholder:text-slate-500 transition-[box-shadow,border-color,color] duration-100 focus:border-primary focus:text-primary focus:outline-none focus:ring-0 focus:shadow-[-3px_-3px_15px_rgba(255,77,0,0.45)]"
            autoComplete="off"
          />
        </div>
      </form>

      {showSuggestions && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-sm border border-white/10 bg-[#0d0d0d] shadow-2xl">
          <div className="border-b border-white/5 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Subwiki suggestions</span>
          </div>
          {suggestions.length > 0 ? (
            suggestions.map((wiki) => (
              <button
                key={wiki.id}
                onClick={() => selectWikiSuggestion(wiki.id)}
                className="flex w-full cursor-pointer items-center gap-3 border-b border-white/[0.03] px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-white/5"
              >
                <span className="ascii-glyph text-[11px] text-primary">{"[>]"}</span>
                <div>
                  <span className="font-mono text-xs text-slate-200">w/{wiki.id}</span>
                  {wiki.displayName !== wiki.id && (
                    <span className="ml-2 text-[10px] text-slate-500">{wiki.displayName}</span>
                  )}
                </div>
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-xs text-slate-500">No subwikis found.</div>
          )}
          <div className="border-t border-white/5 px-4 py-2">
            <button
              onClick={(event) => {
                event.preventDefault();
                navigateToSearch(query);
              }}
              className="cursor-pointer text-[10px] font-mono uppercase tracking-wider text-primary transition-colors hover:text-primary/80"
            >
              Search all posts → Enter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
