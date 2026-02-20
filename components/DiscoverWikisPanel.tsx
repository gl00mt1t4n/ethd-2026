"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Wiki = {
  id: string;
  displayName: string;
  description: string;
};

function pickRandom<T>(items: T[], count: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export function DiscoverWikisPanel() {
  const [featured, setFeatured] = useState<Wiki[]>([]);
  const allWikisRef = useRef<Wiki[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadAndPick() {
      try {
        const response = await fetch("/api/wikis", { cache: "no-store" });
        const data = (await response.json()) as { wikis?: Wiki[] };
        const fetched = Array.isArray(data.wikis) ? data.wikis : [];
        if (cancelled) return;

        const pool = fetched.filter((wiki) => wiki.id !== "general");
        const source = pool.length >= 3 ? pool : fetched;
        allWikisRef.current = source;
        setFeatured(pickRandom(source, 3));
      } catch {
        if (!cancelled) {
          allWikisRef.current = [];
          setFeatured([]);
        }
      }
    }

    void loadAndPick();
    const refresh = setInterval(() => {
      setFeatured((current) => {
        if (allWikisRef.current.length < 1) return current;
        return pickRandom(allWikisRef.current, 3);
      });
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(refresh);
    };
  }, []);

  const hasItems = useMemo(() => featured.length > 0, [featured]);

  return (
    <section className="ascii-panel rounded-lg border border-white/10 bg-[#0a0a0a] p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">&gt; Discover Subwikis</h2>
      {!hasItems ? (
        <p className="text-xs text-slate-500">No wikis available yet.</p>
      ) : (
        <ul className="space-y-2">
          {featured.map((wiki) => (
            <li key={wiki.id}>
              <Link
                href={`/wiki/${wiki.id}`}
                className="block rounded-md border border-white/10 bg-[#121212] px-3 py-2 transition-colors hover:border-white/20"
              >
                <p className="font-mono text-xs text-primary">w/{wiki.id}</p>
                <p className="text-sm font-medium text-white">{wiki.displayName}</p>
                <p className="line-clamp-2 text-xs text-slate-500">{wiki.description || "No description yet."}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[10px] uppercase tracking-widest text-slate-600">&gt; Refreshes every minute</p>
    </section>
  );
}
