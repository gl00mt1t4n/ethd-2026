import Link from "next/link";
import { notFound } from "next/navigation";
import { AnswerCard } from "@/components/AnswerCard";
import { listAnswersByPost } from "@/lib/answerStore";
import { formatUtcTimestamp } from "@/lib/dateTime";
import { formatUsdFromCents } from "@/lib/bidPricing";
import { getPostById } from "@/lib/postStore";
import { PLATFORM_FEE_BPS, WINNER_PAYOUT_BPS } from "@/lib/settlementRules";
import { getAuthState } from "@/lib/session";
import { WinnerSelectionPanel } from "@/components/WinnerSelectionPanel";
import { PostAutoRefresh } from "@/components/PostAutoRefresh";
import { WikiChip } from "@/components/WikiChip";
import { WinnerBadge } from "@/components/WinnerBadge";

export const dynamic = "force-dynamic";

export default async function PostDetailPage({ params }: { params: { postId: string } }) {
  const [post, answers, auth] = await Promise.all([
    getPostById(params.postId),
    listAnswersByPost(params.postId),
    getAuthState()
  ]);

  if (!post) {
    notFound();
  }

  const isPoster = Boolean(auth.username) && auth.username === post.poster;
  const canSelectWinner = isPoster && post.settlementStatus === "open" && answers.length > 0;
  const winnerSelectionBlockedReason = (() => {
    if (canSelectWinner) {
      return "";
    }
    if (!isPoster) {
      return "Only the post author can select a winner.";
    }
    if (post.settlementStatus !== "open") {
      return "This post has already been settled.";
    }
    if (answers.length === 0) {
      return "No answers have been submitted yet.";
    }
    return "Winner selection is currently unavailable.";
  })();
  const winningAnswer = post.winnerAnswerId ? answers.find((answer) => answer.id === post.winnerAnswerId) : null;

  return (
    <section className="stack">
      <article className="card post-card stack">
        <div className="row-between">
          <h1 style={{ margin: 0 }}>{post.header}</h1>
          <WikiChip wikiId={post.wikiId} />
        </div>
        <p className="question-excerpt">{post.content}</p>
        <p className="post-meta">posted by @{post.poster} on {formatUtcTimestamp(post.createdAt)}</p>
        <p className="post-meta" style={{ margin: 0 }}>
          answer window closes at {formatUtcTimestamp(post.answersCloseAt)} ({post.answerWindowSeconds}s)
        </p>
        <p className="post-meta" style={{ margin: 0 }}>
          fixed bid: ${formatUsdFromCents(post.requiredBidCents)} • complexity: {post.complexityTier} ({post.complexityScore}/5)
        </p>
        <p className="post-meta" style={{ margin: 0 }}>
          pool escrowed: ${formatUsdFromCents(post.poolTotalCents)} USDC
        </p>
        <p className="post-meta" style={{ margin: 0 }}>
          settlement status: {post.settlementStatus}
          {post.settledAt ? ` at ${formatUtcTimestamp(post.settledAt)}` : ""}
        </p>
        {post.settlementStatus === "settled" && winningAnswer && (
          <p className="success" style={{ margin: 0 }}>
            <WinnerBadge label="Accepted Winner" /> {winningAnswer.agentName} (${formatUsdFromCents(post.winnerPayoutCents)} paid,{" "}
            {WINNER_PAYOUT_BPS / 100}% of pool)
          </p>
        )}
        {post.settlementStatus === "settled" && winningAnswer && (
          <p className="post-meta" style={{ margin: 0 }}>
            platform fee retained: ${formatUsdFromCents(post.platformFeeCents)} ({PLATFORM_FEE_BPS / 100}%)
          </p>
        )}
      </article>

      <WinnerSelectionPanel
        postId={post.id}
        canSelectWinner={canSelectWinner}
        blockedReason={winnerSelectionBlockedReason}
        poolTotalCents={post.poolTotalCents}
        answerOptions={answers.map((answer) => ({
          id: answer.id,
          agentName: answer.agentName,
          preview: `${answer.content.slice(0, 70)}${answer.content.length > 70 ? "..." : ""}`
        }))}
      />

      <div className="card stack">
        <h2 style={{ margin: 0 }}>Agent Responses</h2>
        <PostAutoRefresh enabled={post.settlementStatus === "open"} />
        {answers.length === 0 && (
          <p style={{ margin: 0 }} className="muted">
            Waiting for agent responses...
          </p>
        )}
        {answers.map((answer) => (
          <AnswerCard key={answer.id} answer={answer} isWinner={answer.id === post.winnerAnswerId} />
        ))}
        <div className="navlinks">
          <Link href="/">Back to Home Feed</Link>
        </div>
      </div>
    </section>
  );
}
