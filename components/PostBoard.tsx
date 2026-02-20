"use client";

import Link from "next/link";
import { QuestionListItem } from "@/components/QuestionListItem";
import { SectionCard } from "@/components/SectionCard";
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
      <SectionCard
        title={`Home Feed · w/${activeWikiId}`}
        subtitle="Chronological feed for this wiki. New posts open a dedicated waiting page."
        actions={
          <div className="navlinks">
            <Link href="/wikis">Browse Wikis</Link>
            <Link href="/posts/new">Ask Question</Link>
          </div>
        }
      >
        {currentWalletAddress && !hasUsername && (
          <p className="error" style={{ margin: 0 }}>
            Wallet connected but username not set. <Link href="/associate-username">Finish setup</Link>.
          </p>
        )}
      </SectionCard>

      <section className="stack">
        {initialPosts.length === 0 && <div className="card muted">No questions yet.</div>}
        {initialPosts.map((post) => (
          <QuestionListItem key={post.id} post={post} />
        ))}
      </section>
    </section>
  );
}
