import { prisma } from "@/lib/prisma";
import { createPost, type Post } from "@/lib/types";

const MIN_ANSWER_WINDOW_SECONDS = 60;
const MAX_ANSWER_WINDOW_SECONDS = 60 * 60;

function toPost(record: {
  id: string;
  poster: string;
  header: string;
  content: string;
  createdAt: Date;
  requiredBidCents: number;
  complexityTier: string;
  complexityScore: number;
  complexityModel: string | null;
  answerWindowSeconds: number;
  answersCloseAt: Date;
  settlementStatus: string;
  winnerAnswerId: string | null;
  winnerAgentId: string | null;
  settledAt: Date | null;
  settlementTxHash: string | null;
  poolTotalCents: number;
  winnerPayoutCents: number;
  platformFeeCents: number;
}): Post {
  return {
    id: record.id,
    poster: record.poster,
    header: record.header,
    content: record.content,
    createdAt: record.createdAt.toISOString(),
    requiredBidCents: record.requiredBidCents,
    complexityTier: (record.complexityTier === "simple" || record.complexityTier === "complex" ? record.complexityTier : "medium"),
    complexityScore: record.complexityScore,
    complexityModel: record.complexityModel,
    answerWindowSeconds: record.answerWindowSeconds,
    answersCloseAt: record.answersCloseAt.toISOString(),
    settlementStatus: record.settlementStatus === "settled" ? "settled" : "open",
    winnerAnswerId: record.winnerAnswerId,
    winnerAgentId: record.winnerAgentId,
    settledAt: record.settledAt?.toISOString() ?? null,
    settlementTxHash: record.settlementTxHash,
    poolTotalCents: record.poolTotalCents,
    winnerPayoutCents: record.winnerPayoutCents,
    platformFeeCents: record.platformFeeCents
  };
}

export async function listPosts(): Promise<Post[]> {
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: "desc" }
  });
  return posts.map(toPost);
}

export async function getPostById(postId: string): Promise<Post | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId }
  });
  return post ? toPost(post) : null;
}

export async function addPost(input: {
  poster: string;
  header: string;
  content: string;
  requiredBidCents?: number;
  complexityTier?: "simple" | "medium" | "complex";
  complexityScore?: number;
  complexityModel?: string | null;
  answerWindowSeconds?: number;
}): Promise<{ ok: true; post: Post } | { ok: false; error: string }> {
  if (input.header.trim().length < 4) {
    return { ok: false, error: "Header must be at least 4 characters." };
  }

  if (input.content.trim().length < 10) {
    return { ok: false, error: "Content must be at least 10 characters." };
  }

  const rawWindow = Number(input.answerWindowSeconds ?? 300);
  const answerWindowSeconds = Number.isFinite(rawWindow)
    ? Math.floor(rawWindow)
    : 300;

  if (answerWindowSeconds < MIN_ANSWER_WINDOW_SECONDS || answerWindowSeconds > MAX_ANSWER_WINDOW_SECONDS) {
    return { ok: false, error: "Answer window must be between 60 and 3600 seconds." };
  }

  const requiredBidCents = Number.isFinite(Number(input.requiredBidCents))
    ? Math.max(1, Math.floor(Number(input.requiredBidCents)))
    : 75;

  const post = createPost({
    ...input,
    requiredBidCents,
    complexityTier: input.complexityTier ?? "medium",
    complexityScore: input.complexityScore ?? 3,
    complexityModel: input.complexityModel ?? null,
    answerWindowSeconds
  });
  const created = await prisma.post.create({
    data: {
      id: post.id,
      poster: post.poster,
      header: post.header,
      content: post.content,
      createdAt: new Date(post.createdAt),
      requiredBidCents: post.requiredBidCents,
      complexityTier: post.complexityTier,
      complexityScore: post.complexityScore,
      complexityModel: post.complexityModel,
      answerWindowSeconds: post.answerWindowSeconds,
      answersCloseAt: new Date(post.answersCloseAt),
      settlementStatus: post.settlementStatus,
      winnerAnswerId: post.winnerAnswerId,
      winnerAgentId: post.winnerAgentId,
      settledAt: null,
      settlementTxHash: null,
      poolTotalCents: 0,
      winnerPayoutCents: 0,
      platformFeeCents: 0
    }
  });
  return { ok: true, post: toPost(created) };
}

export async function settlePost(input: {
  postId: string;
  winnerAnswerId: string;
  winnerAgentId: string;
  winnerPayoutCents: number;
  platformFeeCents: number;
  settlementTxHash: string;
}): Promise<Post | null> {
  const settled = await prisma.post.update({
    where: { id: input.postId },
    data: {
      settlementStatus: "settled",
      winnerAnswerId: input.winnerAnswerId,
      winnerAgentId: input.winnerAgentId,
      settledAt: new Date(),
      settlementTxHash: input.settlementTxHash,
      winnerPayoutCents: input.winnerPayoutCents,
      platformFeeCents: input.platformFeeCents
    }
  });
  return settled ? toPost(settled) : null;
}
