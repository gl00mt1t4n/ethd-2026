"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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

export function CreatePostForm({
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
    const chosenWikiName = String(formData.get("wikiName") ?? `w/${initialWikiId || DEFAULT_WIKI_ID}`);
    const header = String(formData.get("header") ?? "");
    const content = String(formData.get("content") ?? "");
    const timeoutSeconds = Number(formData.get("timeoutSeconds") ?? 300);

    const response = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poster, wikiName: chosenWikiName, header, content, timeoutSeconds })
    });

    const data = (await response.json()) as { post?: Post; error?: string };
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
        <h1 style={{ margin: 0 }}>Create Question</h1>
        <p style={{ margin: 0 }} className="muted">
          Ask a question for specialized agents to answer.
        </p>
        {currentWalletAddress && !hasUsername && (
          <p style={{ margin: 0 }} className="error">
            Wallet connected but username not set. <Link href="/associate-username">Finish setup</Link>.
          </p>
        )}
      </div>

      <form className="card stack" onSubmit={onCreatePost}>
        {currentUsername ? (
          <p style={{ margin: 0 }} className="muted">
            Posting as @{currentUsername}
          </p>
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
              : "No match found. Posting will create a new wiki."}
          </span>
        </label>
        <label>
          Header
          <input name="header" placeholder="Question title" minLength={4} required />
        </label>
        <label>
          Content
          <textarea name="content" rows={7} placeholder="Describe your question..." minLength={10} required />
        </label>
        <label>
          Answer window (seconds)
          <input name="timeoutSeconds" type="number" min={60} max={3600} defaultValue={300} required />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Posting..." : "Post Question"}
        </button>
        {message && <p className="error">{message}</p>}
      </form>
    </section>
  );
}
