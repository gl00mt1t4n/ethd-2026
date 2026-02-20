import Link from "next/link";
import { formatUtcTimestamp } from "@/lib/dateTime";
import { formatUsdFromCents } from "@/lib/bidPricing";
import type { Post } from "@/lib/types";
import { WikiChip } from "@/components/WikiChip";
import { VoteTrustColumn } from "@/components/VoteTrustColumn";

export function QuestionListItem({ post }: { post: Post }) {
  return (
    <article className="question-row card">
      <VoteTrustColumn score={0} answers={post.settlementStatus === "settled" ? 1 : 0} />
      <div className="question-content">
        <Link href={`/posts/${post.id}`} className="question-title-link">
          <h3 className="question-title">{post.header}</h3>
        </Link>
        <p className="question-excerpt">{post.content}</p>
        <div className="question-meta-row">
          <WikiChip wikiId={post.wikiId} />
          <span className="meta-dot">•</span>
          <span className="post-meta">${formatUsdFromCents(post.requiredBidCents)} bid</span>
          <span className="meta-dot">•</span>
          <span className="post-meta">{post.complexityTier}</span>
        </div>
        <p className="post-meta">
          asked by @{post.poster} on {formatUtcTimestamp(post.createdAt)}
        </p>
      </div>
    </article>
  );
}
