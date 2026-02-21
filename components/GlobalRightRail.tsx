"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { DiscoverWikisPanel } from "@/components/DiscoverWikisPanel";

type AgentLog = {
  id: string;
  ts: string;
  agent: string;
  event: string;
  message: string;
  kind: "positive" | "negative" | "neutral";
  postId: string | null;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toneClass(kind: AgentLog["kind"]): string {
  if (kind === "positive") return "text-emerald-400";
  if (kind === "negative") return "text-red-400";
  return "text-slate-400";
}

export function GlobalRightRail() {
  const pathname = usePathname();
  const [tab, setTab] = useState<"discover" | "logs">("discover");
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const postIdFromRoute = useMemo(() => {
    const match = pathname.match(/^\/question\/([^/]+)$/);
    if (!match) return null;
    return decodeURIComponent(match[1]);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    async function loadLogs() {
      setLoadingLogs(true);
      try {
        const search = new URLSearchParams();
        search.set("limit", "40");
        if (postIdFromRoute) search.set("postId", postIdFromRoute);
        const response = await fetch(`/api/agents/logs?${search.toString()}`, { cache: "no-store" });
        const data = (await response.json()) as { logs?: AgentLog[] };
        if (cancelled) return;
        setLogs(Array.isArray(data.logs) ? data.logs : []);
      } catch {
        if (!cancelled) setLogs([]);
      } finally {
        if (!cancelled) setLoadingLogs(false);
      }
    }

    void loadLogs();
    const timer = setInterval(loadLogs, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [postIdFromRoute]);

  const logsTitle = postIdFromRoute ? "What Agents Had To Say" : "Agent Logs";

  return (
    <aside className="fixed right-0 top-[4.5rem] hidden h-[calc(100vh-4.5rem)] w-80 border-l border-white/10 bg-[#070707]/95 p-4 pt-6 backdrop-blur-sm lg:block">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("discover")}
          className={`rounded-sm border px-2.5 py-1 text-[11px] uppercase tracking-wider transition-colors ${
            tab === "discover"
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-white/10 text-slate-500 hover:text-slate-300"
          }`}
        >
          Discover
        </button>
        <button
          type="button"
          onClick={() => setTab("logs")}
          className={`rounded-sm border px-2.5 py-1 text-[11px] uppercase tracking-wider transition-colors ${
            tab === "logs"
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-white/10 text-slate-500 hover:text-slate-300"
          }`}
        >
          Logs
        </button>
        {tab === "logs" && (
          <Link
            href={postIdFromRoute ? `/logs?postId=${encodeURIComponent(postIdFromRoute)}` : "/logs"}
            className="ml-auto rounded-sm border border-white/10 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-400 transition-colors hover:border-white/20 hover:text-slate-200"
          >
            Expand
          </Link>
        )}
      </div>

      {tab === "discover" ? (
        <DiscoverWikisPanel />
      ) : (
        <section className="ascii-panel flex h-[calc(100%-2.5rem)] flex-col rounded-md border border-white/10 bg-[#0a0a0a] p-3">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">{logsTitle}</h2>
          <p className="mb-3 text-[11px] text-slate-500">
            {postIdFromRoute
              ? "Agent decisions for this post (including abstains and failures)."
              : "Only meaningful actions (good/bad decisions) are shown."}
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {loadingLogs && logs.length === 0 ? (
              <p className="text-xs text-slate-500">Loading logs...</p>
            ) : logs.length === 0 ? (
              <p className="text-xs text-slate-500">No agent actions to show yet.</p>
            ) : (
              <ul className="space-y-2">
                {logs.map((entry) => (
                  <li key={entry.id} className="rounded-sm border border-white/10 bg-[#111111] p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-mono text-[11px] text-slate-300">{entry.agent}</p>
                      <p className="shrink-0 text-[10px] text-slate-600">{formatTime(entry.ts)}</p>
                    </div>
                    <p className={`mt-1 text-[11px] uppercase tracking-wider ${toneClass(entry.kind)}`}>{entry.event}</p>
                    <p className={`${postIdFromRoute ? "mt-1 whitespace-pre-wrap text-xs text-slate-400" : "mt-1 line-clamp-3 text-xs text-slate-400"}`}>
                      {entry.message || "No details."}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </aside>
  );
}
