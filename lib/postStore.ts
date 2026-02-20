import { prisma } from "@/lib/prisma";
import { DEFAULT_WIKI_DISPLAY_NAME, DEFAULT_WIKI_ID, resolveWikiForPost } from "@/lib/wikiStore";
import { createPost, type Post } from "@/lib/types";

const MIN_ANSWER_WINDOW_SECONDS = 60;
const MAX_ANSWER_WINDOW_SECONDS = 60 * 60;

function normalizeWikiId(rawWikiId: string | null | undefined): string {
  const value = String(rawWikiId ?? "")
    .trim()
    .toLowerCase()
    .replace(/^w\//, "");
  return value || DEFAULT_WIKI_ID;
}

function getFallbackWikiDisplayName(wikiId: string): string {
  if (wikiId === DEFAULT_WIKI_ID) {
    return DEFAULT_WIKI_DISPLAY_NAME;
  }

  return wikiId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function toPost(record: {
  id: string;
  poster: string;
  wikiId?: string | null;
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
  answerCount?: number | null;
  wiki?: {
    id: string;
    displayName: string;
  } | null;
  _count?: {
    answers?: number;
  };
}): Post {
  const answerWindowSeconds =
    Number.isFinite(Number(record.answerWindowSeconds)) && Number(record.answerWindowSeconds) > 0
      ? Number(record.answerWindowSeconds)
      : 300;
  const answersCloseAt = record.answersCloseAt
    ? record.answersCloseAt
    : new Date(record.createdAt.getTime() + answerWindowSeconds * 1000);
  const wikiId = normalizeWikiId(record.wikiId);
  const wikiDisplayName = record.wiki?.displayName ?? getFallbackWikiDisplayName(wikiId);
  const answerCount = Number(record._count?.answers ?? record.answerCount ?? 0);

  return {
    id: record.id,
    poster: record.poster,
    wikiId,
    wikiDisplayName,
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
    platformFeeCents: Number(record.platformFeeCents ?? 0),
    answerCount
  };
}

export async function listPosts(options?: { wikiId?: string | null }): Promise<Post[]> {
  const wikiId = options?.wikiId ? normalizeWikiId(options.wikiId) : null;
  const posts = await prisma.post.findMany({
    where: wikiId
      ? wikiId === DEFAULT_WIKI_ID
        ? {
            OR: [{ wikiId: DEFAULT_WIKI_ID }, { wikiId: null }]
          }
        : { wikiId }
      : undefined,
    include: {
      wiki: {
        select: {
          id: true,
          displayName: true
        }
      },
      _count: {
        select: {
          answers: true
        }
      }
    },
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
  options?: { wikiIds?: string[] },
  limit = 500
): Promise<Post[]> {
  const anchorDate = anchor ? new Date(anchor.createdAt) : null;
  const anchorId = anchor?.id ?? "";
  const hasExplicitWikiFilter = Array.isArray(options?.wikiIds);
  const wikiIds = options?.wikiIds?.map((wikiId) => normalizeWikiId(wikiId)).filter(Boolean) ?? [];
  if (hasExplicitWikiFilter && wikiIds.length === 0) {
    return [];
  }
  const wikiFilter =
    wikiIds.length > 0
      ? {
          OR: wikiIds.flatMap((wikiId) =>
            wikiId === DEFAULT_WIKI_ID ? [{ wikiId: DEFAULT_WIKI_ID }, { wikiId: null }] : [{ wikiId }]
          )
        }
      : undefined;

  const posts = await prisma.post.findMany({
    where: anchorDate
      ? {
          AND: [
            wikiFilter ?? {},
            {
              OR: [{ createdAt: { gt: anchorDate } }, { createdAt: anchorDate, id: { gt: anchorId } }]
            }
          ]
        }
      : wikiFilter,
    include: {
      wiki: {
        select: {
          id: true,
          displayName: true
        }
      },
      _count: {
        select: {
          answers: true
        }
      }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit
  });

  return posts.map((post) => toPost(post as any));
}

export async function getPostById(postId: string): Promise<Post | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      wiki: {
        select: {
          id: true,
          displayName: true
        }
      },
      _count: {
        select: {
          answers: true
        }
      }
    }
  });
  return post ? toPost(post as any) : null;
}

export async function addPost(input: {
  poster: string;
  wikiName?: string;
  wikiId?: string;
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
  const wikiQuery = input.wikiName?.trim() || input.wikiId?.trim() || "";
  const resolvedWiki = await resolveWikiForPost({
    wikiQuery
  });

  if (!resolvedWiki.ok) {
    return { ok: false, error: resolvedWiki.error };
  }

  const post = createPost({
    poster: input.poster,
    wikiId: resolvedWiki.wiki.id,
    wikiDisplayName: resolvedWiki.wiki.displayName,
    header: input.header,
    content: input.content,
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
      wikiId: post.wikiId,
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
    } as any,
    include: {
      wiki: {
        select: {
          id: true,
          displayName: true
        }
      },
      _count: {
        select: {
          answers: true
        }
      }
    }
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
    } as any,
    include: {
      wiki: {
        select: {
          id: true,
          displayName: true
        }
      },
      _count: {
        select: {
          answers: true
        }
      }
    }
  });
  return settled ? toPost(settled as any) : null;
}

export async function searchPosts(query: string, limit = 40): Promise<Post[]> {
  const q = query.trim();
  if (!q) {
    return [];
  }

  const posts = await prisma.post.findMany({
    where: {
      OR: [
        { header: { contains: q, mode: "insensitive" } },
        { content: { contains: q, mode: "insensitive" } },
        { poster: { contains: q, mode: "insensitive" } },
        { wikiId: { contains: q.toLowerCase().replace(/^w\//, ""), mode: "insensitive" } }
      ]
    },
    include: {
      wiki: {
        select: {
          id: true,
          displayName: true
        }
      },
      _count: {
        select: {
          answers: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });

  return posts.map((post) => toPost(post as any));
}
