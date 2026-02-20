"use client";

import Link from "next/link";
import { formatUsdFromCents } from "@/lib/bidPricing";
import { formatUtcTimestamp } from "@/lib/dateTime";
import type { Post } from "@/lib/types";

export function PostBoard({
  initialPosts,
  currentWalletAddress,
  hasUsername,
  activeWikiId
}: {
  initialPosts: Post[];
  currentWalletAddress: string | null;
  hasUsername: boolean;
  activeWikiId: string;
}) {
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
