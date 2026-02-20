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
      } catch {
        if (!cancelled) {
          setSuggestions([]);
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
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={onSubmit} className="search-box">
      <input
        name="q"
        list="wiki-search-suggestions"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search posts or wikis"
      />
      <datalist id="wiki-search-suggestions">
        {suggestions.map((wiki) => (
          <option key={wiki.id} value={`w/${wiki.id}`}>
            {wiki.displayName}
          </option>
        ))}
      </datalist>
      <button type="submit">Search</button>
    </form>
  );
}
