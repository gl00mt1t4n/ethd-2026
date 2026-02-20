"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type WikiSuggestion = {
  id: string;
  displayName: string;
};

export function SearchBox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [suggestions, setSuggestions] = useState<WikiSuggestion[]>([]);
  const [open, setOpen] = useState(false);

  const trimmedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

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
        if (cancelled) {
          return;
        }
        setSuggestions(Array.isArray(data.wikis) ? data.wikis : []);
        setOpen(true);
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setOpen(false);
        }
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [trimmedQuery]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = query.trim();
    if (!q) {
      return;
    }
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={onSubmit} className="search-box" role="search">
      <input
        name="q"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onFocus={() => setOpen(true)}
        placeholder="Search posts or wikis"
        aria-label="Search posts or wikis"
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="search-suggestions" role="listbox" aria-label="Wiki suggestions">
          {suggestions.map((wiki) => (
            <button
              key={wiki.id}
              type="button"
              className="suggestion-item"
              onClick={() => {
                setQuery(`w/${wiki.id}`);
                setOpen(false);
              }}
            >
              <span className="suggestion-main">w/{wiki.id}</span>
              <span className="suggestion-sub">{wiki.displayName}</span>
            </button>
          ))}
        </div>
      )}
      <button type="submit">Search</button>
    </form>
  );
}
