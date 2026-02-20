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
  requiredBidCents?: number | null;
  complexityTier?: string | null;
  complexityScore?: number | null;
  complexityModel?: string | null;
  answerWindowSeconds?: number | null;
  answersCloseAt?: Date | null;
  settlementStatus?: string | null;
  winnerAnswerId?: string | null;
  winnerAgentId?: string | null;
  settledAt?: Date | null;
  settlementTxHash?: string | null;
  poolTotalCents?: number | null;
  winnerPayoutCents?: number | null;
  platformFeeCents?: number | null;
}): Post {
  const answerWindowSeconds =
    Number.isFinite(Number(record.answerWindowSeconds)) && Number(record.answerWindowSeconds) > 0
      ? Number(record.answerWindowSeconds)
      : 300;
  const answersCloseAt = record.answersCloseAt
    ? record.answersCloseAt
    : new Date(record.createdAt.getTime() + answerWindowSeconds * 1000);

  return {
    id: record.id,
    poster: record.poster,
    header: record.header,
    content: record.content,
    createdAt: record.createdAt.toISOString(),
    requiredBidCents: Number(record.requiredBidCents ?? 75),
    complexityTier:
      record.complexityTier === "simple" || record.complexityTier === "complex"
        ? record.complexityTier
        : "medium",
    complexityScore: Number(record.complexityScore ?? 3),
    complexityModel: record.complexityModel ?? null,
    answerWindowSeconds,
    answersCloseAt: answersCloseAt.toISOString(),
    settlementStatus: record.settlementStatus === "settled" ? "settled" : "open",
    winnerAnswerId: record.winnerAnswerId ?? null,
    winnerAgentId: record.winnerAgentId ?? null,
    settledAt: record.settledAt?.toISOString() ?? null,
    settlementTxHash: record.settlementTxHash ?? null,
    poolTotalCents: Number(record.poolTotalCents ?? 0),
    winnerPayoutCents: Number(record.winnerPayoutCents ?? 0),
    platformFeeCents: Number(record.platformFeeCents ?? 0)
  };
}

export async function listPosts(): Promise<Post[]> {
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: "desc" }
  });
  return posts.map((post) => toPost(post as any));
}

export async function getLatestPostAnchor(): Promise<{ id: string; createdAt: string } | null> {
  const post = await prisma.post.findFirst({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, createdAt: true }
  });

  if (!post) {
    return null;
  }

  return {
    id: post.id,
    createdAt: post.createdAt.toISOString()
  };
}

export async function listPostsAfterAnchor(
  anchor: { id: string; createdAt: string } | null,
  limit = 500
): Promise<Post[]> {
  const anchorDate = anchor ? new Date(anchor.createdAt) : null;
  const anchorId = anchor?.id ?? "";

  const posts = await prisma.post.findMany({
    where: anchorDate
      ? {
          OR: [{ createdAt: { gt: anchorDate } }, { createdAt: anchorDate, id: { gt: anchorId } }]
        }
      : undefined,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit
  });

  return posts.map((post) => toPost(post as any));
}

export async function getPostById(postId: string): Promise<Post | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId }
  });
  return post ? toPost(post as any) : null;
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
    } as any
  });
  return { ok: true, post: toPost(created as any) };
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
    } as any
  });
  return settled ? toPost(settled as any) : null;
}
