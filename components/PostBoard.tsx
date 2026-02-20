"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatUsdFromCents } from "@/lib/bidPricing";
import { formatUtcTimestamp } from "@/lib/dateTime";
import { DEFAULT_WIKI_ID } from "@/lib/wikiStore";
import type { Post, Wiki } from "@/lib/types";

type RankedWiki = {
  wiki: Wiki;
  score: number;
};

function normalizeWikiQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/^w\//, "");
}

function scoreWiki(query: string, wiki: Wiki): number {
  const normalizedQuery = normalizeWikiQuery(query);
  if (!normalizedQuery) {
    return 0;
  }

  const id = wiki.id.toLowerCase();
  const display = wiki.displayName.toLowerCase();

  if (id === normalizedQuery) return 100;
  if (display === normalizedQuery) return 95;
  if (id.startsWith(normalizedQuery)) return 85;
  if (display.startsWith(normalizedQuery)) return 80;
  if (id.includes(normalizedQuery)) return 70;
  if (display.includes(normalizedQuery)) return 65;

  return 0;
}

export function PostBoard({
  initialPosts,
  initialWikis,
  currentUsername,
  currentWalletAddress,
  hasUsername,
  activeWikiId
}: {
  initialPosts: Post[];
  initialWikis: Wiki[];
  currentUsername: string | null;
  currentWalletAddress: string | null;
  hasUsername: boolean;
  activeWikiId: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [wikiName, setWikiName] = useState(`w/${activeWikiId || DEFAULT_WIKI_ID}`);
  const recommendedWiki = useMemo<Wiki | null>(() => {
    const ranked: RankedWiki[] = initialWikis
      .map((wiki) => ({ wiki, score: scoreWiki(wikiName, wiki) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    return ranked.length > 0 ? ranked[0].wiki : null;
  }, [initialWikis, wikiName]);

  async function onCreatePost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setLoading(true);
    setMessage("");

    const formData = new FormData(form);
    const poster = String(formData.get("poster") ?? "anonymous").trim();
    const wikiName = String(formData.get("wikiName") ?? `w/${activeWikiId || DEFAULT_WIKI_ID}`);
    const header = String(formData.get("header") ?? "");
    const content = String(formData.get("content") ?? "");
    const timeoutSeconds = Number(formData.get("timeoutSeconds") ?? 300);

    const response = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poster, wikiName, header, content, timeoutSeconds })
    });

    const data = (await response.json()) as { ok?: boolean; error?: string; post?: Post };
    setLoading(false);

    if (!response.ok || !data.post) {
      setMessage(data.error ?? "Could not create post.");
      return;
    }

    router.push(`/posts/${data.post.id}`);
    router.refresh();
  }

  return (
    <section className="stack">
      <div className="card stack">
        <h1 style={{ margin: 0 }}>Home Feed · w/{activeWikiId}</h1>
        <p style={{ margin: 0 }} className="muted">
          Chronological feed for this wiki. New posts open their dedicated waiting page.
        </p>
        <div className="navlinks">
          <Link href="/wikis/new">Create Wiki</Link>
        </div>
        {currentWalletAddress && !hasUsername && (
          <p style={{ margin: 0 }} className="error">
            Wallet connected but username not set. <Link href="/associate-username">Finish setup</Link>.
          </p>
        )}
      </div>

      <form className="card stack" onSubmit={onCreatePost}>
        <h2 style={{ margin: 0 }}>Ask a question</h2>
        {currentUsername ? (
          <p style={{ margin: 0 }} className="muted">Posting as @{currentUsername}</p>
        ) : (
          <label>
            Poster
            <input name="poster" placeholder="username or anonymous" />
          </label>
        )}
        <label>
          Wiki
          <input
            name="wikiName"
            list="wiki-name-options"
            placeholder="w/general"
            value={wikiName}
            onChange={(event) => setWikiName(event.target.value)}
            required
          />
          <datalist id="wiki-name-options">
            {initialWikis.map((wiki) => (
              <option key={wiki.id} value={`w/${wiki.id}`}>
                {wiki.displayName}
              </option>
            ))}
          </datalist>
          <span className="post-meta">
            {recommendedWiki
              ? `Best match: w/${recommendedWiki.id}`
              : "No wiki match found. Create it first from Create Wiki."}
          </span>
        </label>
        <label>
          Header
          <input name="header" placeholder="Question title" minLength={4} required />
        </label>
        <label>
          Content
          <textarea name="content" rows={6} placeholder="Describe your question..." minLength={10} required />
        </label>
        <label>
          Answer window (seconds)
          <input name="timeoutSeconds" type="number" min={60} max={3600} defaultValue={300} required />
        </label>
        <button type="submit" disabled={loading}>{loading ? "Posting..." : "Post Question"}</button>
        {message && <p className="error">{message}</p>}
      </form>

      <section className="stack">
        {initialPosts.length === 0 && <div className="card muted">No posts yet.</div>}
        {initialPosts.map((post) => (
          <article key={post.id} className="card post-card">
            <div className="post-shell">
              <div className="vote-col">
                <div className="vote-pill">0</div>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                <Link href={`/posts/${post.id}`} className="post-title-link">
                  <h3 style={{ margin: 0 }}>{post.header}</h3>
                </Link>
                <p style={{ margin: 0 }}>{post.content}</p>
                <p className="post-meta" style={{ margin: 0 }}>
                  <Link href={`/w/${post.wikiId}`}>w/{post.wikiId}</Link> • posted by @{post.poster} on{" "}
                  {formatUtcTimestamp(post.createdAt)}
                </p>
                <p className="post-meta" style={{ margin: 0 }}>
                  fixed bid ${formatUsdFromCents(post.requiredBidCents)} • {post.complexityTier} complexity
                </p>
              </div>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}
