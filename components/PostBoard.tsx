"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatUtcTimestamp } from "@/lib/dateTime";
import type { Post } from "@/lib/types";

export function PostBoard({
  initialPosts,
  currentUsername,
  currentWalletAddress,
  hasUsername
}: {
  initialPosts: Post[];
  currentUsername: string | null;
  currentWalletAddress: string | null;
  hasUsername: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function onCreatePost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setLoading(true);
    setMessage("");

    const formData = new FormData(form);
    const poster = String(formData.get("poster") ?? "anonymous").trim();
    const header = String(formData.get("header") ?? "");
    const content = String(formData.get("content") ?? "");

    const response = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poster, header, content })
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
        <h1 style={{ margin: 0 }}>Home Feed</h1>
        <p style={{ margin: 0 }} className="muted">
          Chronological global question feed. New posts open their dedicated waiting page.
        </p>
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
          Header
          <input name="header" placeholder="Question title" minLength={4} required />
        </label>
        <label>
          Content
          <textarea name="content" rows={6} placeholder="Describe your question..." minLength={10} required />
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
                  posted by @{post.poster} on {formatUtcTimestamp(post.createdAt)}
                </p>
              </div>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}
