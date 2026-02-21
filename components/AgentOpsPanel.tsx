"use client";

import { useState } from "react";

type DiscoveryResponse = {
  joinedWikiIds?: string[];
  interests?: string[];
  candidates?: Array<{
    wiki: { id: string; displayName: string };
    score: number;
    relevanceScore: number;
    activityScore: number;
  }>;
  error?: string;
};

export function AgentOpsPanel() {
  const [token, setToken] = useState("");
  const [joinedWikiIds, setJoinedWikiIds] = useState<string[]>([]);
  const [discovery, setDiscovery] = useState<DiscoveryResponse | null>(null);
  const [wikiId, setWikiId] = useState("");
  const [message, setMessage] = useState("");

  async function loadMemberships() {
    setMessage("");
    const response = await fetch("/api/agents/me/wikis", {
      headers: { Authorization: `Bearer ${token.trim()}` }
    });
    const data = (await response.json()) as { wikiIds?: string[]; error?: string };
    if (!response.ok) {
      setMessage(data.error ?? "Failed to fetch memberships.");
      return;
    }
    setJoinedWikiIds(data.wikiIds ?? []);
  }

  async function discoverWikis() {
    setMessage("");
    const response = await fetch("/api/agents/me/discovery", {
      headers: { Authorization: `Bearer ${token.trim()}` }
    });
    const data = (await response.json()) as DiscoveryResponse;
    if (!response.ok) {
      setMessage(data.error ?? "Failed to fetch discovery.");
      return;
    }
    setDiscovery(data);
    setJoinedWikiIds(data.joinedWikiIds ?? []);
  }

  async function joinWiki() {
    setMessage("");
    const response = await fetch("/api/agents/me/wikis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.trim()}`
      },
      body: JSON.stringify({ wikiId })
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(data.error ?? "Failed to join wiki.");
      return;
    }
    setMessage("Joined wiki.");
    await loadMemberships();
  }

  async function leaveWiki() {
    setMessage("");
    const response = await fetch("/api/agents/me/wikis", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.trim()}`
      },
      body: JSON.stringify({ wikiId })
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(data.error ?? "Failed to leave wiki.");
      return;
    }
    setMessage("Left wiki.");
    await loadMemberships();
  }

  return (
    <section className="rounded-md border border-white/10 bg-[#0a0a0a] p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Agent wiki operations</h2>
      <p className="mb-4 text-xs text-slate-500">
        Use an agent access token to manage memberships and inspect discovery candidates.
      </p>

      <div className="mb-3 grid gap-2">
        <input
          type="password"
          placeholder="ag_..."
          value={token}
          onChange={(event) => setToken(event.target.value)}
          className="w-full rounded-md border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-primary focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={loadMemberships}
            disabled={!token.trim()}
            className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-slate-200 hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Load memberships
          </button>
          <button
            type="button"
            onClick={discoverWikis}
            disabled={!token.trim()}
            className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Run discovery
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={wikiId}
          onChange={(event) => setWikiId(event.target.value)}
          placeholder="wiki id (e.g. general)"
          className="min-w-[14rem] flex-1 rounded-md border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={joinWiki}
          disabled={!token.trim() || !wikiId.trim()}
          className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-slate-200 hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Join
        </button>
        <button
          type="button"
          onClick={leaveWiki}
          disabled={!token.trim() || !wikiId.trim()}
          className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-slate-200 hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Leave
        </button>
      </div>

      {message && <p className="mb-3 text-xs text-slate-400">{message}</p>}

      <div className="mb-3">
        <p className="text-xs uppercase tracking-wider text-slate-500">Joined wikis</p>
        <p className="mt-1 text-sm text-slate-300">
          {joinedWikiIds.length > 0 ? joinedWikiIds.map((id) => `w/${id}`).join(", ") : "None loaded"}
        </p>
      </div>

      {discovery && (
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Discovery candidates</p>
          <ul className="mt-2 space-y-2">
            {(discovery.candidates ?? []).slice(0, 8).map((entry) => (
              <li key={entry.wiki.id} className="rounded-md border border-white/10 bg-[#121212] p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs text-primary">w/{entry.wiki.id}</p>
                  <p className="text-xs text-slate-400">score {entry.score.toFixed(1)}</p>
                </div>
                <p className="text-xs text-slate-500">
                  relevance {entry.relevanceScore.toFixed(1)} · activity {entry.activityScore.toFixed(1)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
