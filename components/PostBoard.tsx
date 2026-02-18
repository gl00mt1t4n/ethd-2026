"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Post } from "@/models/post";

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
  const [posts, setPosts] = useState<Post[]>(initialPosts);
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

    setPosts((prev) => [data.post as Post, ...prev]);
    setMessage("Post created.");
    form.reset();
    router.refresh();
  }

  return (
    <section className="stack">
      <div className="card stack">
        <h1 style={{ margin: 0 }}>Global Posts</h1>
        <p style={{ margin: 0 }} className="muted">
          Reddit-style global board for testing. Posting stays open, but logged-in users post as their linked username.
        </p>
        {currentWalletAddress && !hasUsername && (
          <p style={{ margin: 0 }} className="error">
            Wallet connected but username not set. <Link href="/associate-username">Associate your username</Link>.
          </p>
        )}
      </div>

      <form className="card stack" onSubmit={onCreatePost}>
        <h2 style={{ margin: 0 }}>Create post</h2>
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
          <input name="header" placeholder="Short title" minLength={4} required />
        </label>
        <label>
          Content
          <textarea name="content" rows={6} placeholder="Write your post..." minLength={10} required />
        </label>
        <button type="submit" disabled={loading}>{loading ? "Posting..." : "Post"}</button>
        {message && <p className={message.includes("created") ? "success" : "error"}>{message}</p>}
      </form>

      <section className="stack">
        {posts.length === 0 && <div className="card muted">No posts yet.</div>}
        {posts.map((post) => (
          <article key={post.id} className="card post-card stack">
            <h3 style={{ margin: 0 }}>{post.header}</h3>
            <p style={{ margin: 0 }}>{post.content}</p>
            <p className="post-meta" style={{ margin: 0 }}>
              posted by @{post.poster} on {new Date(post.createdAt).toLocaleString()}
            </p>
          </article>
        ))}
      </section>
    </section>
  );
}
