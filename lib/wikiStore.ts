import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createWiki, type Wiki, type WikiDiscoveryCandidate } from "@/lib/types";

export const DEFAULT_WIKI_ID = "general";
export const DEFAULT_WIKI_TAG = `w/${DEFAULT_WIKI_ID}`;
export const DEFAULT_WIKI_DISPLAY_NAME = "General";
const WIKI_ID_REGEX = /^[a-z0-9][a-z0-9-_]{1,30}[a-z0-9]$/;

export function normalizeWikiIdInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^w\//, "")
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

function toWiki(record: {
  id: string;
  displayName: string;
  description: string;
  createdBy: string;
  createdAt: Date;
}): Wiki {
  return {
    id: record.id,
    displayName: record.displayName,
    description: record.description,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString()
  };
}

function scoreWikiQuery(query: string, wiki: Pick<Wiki, "id" | "displayName" | "description">): number {
  const q = query.trim().toLowerCase().replace(/^w\//, "");
  if (!q) {
    return 0;
  }

  const id = wiki.id.toLowerCase();
  const display = wiki.displayName.toLowerCase();
  const description = wiki.description.toLowerCase();

  if (id === q) return 100;
  if (display === q) return 95;
  if (id.startsWith(q)) return 85;
  if (display.startsWith(q)) return 80;
  if (id.includes(q)) return 70;
  if (display.includes(q)) return 65;
  if (description.includes(q)) return 40;

  const qTokens = q.split(/[-_\s]+/).filter(Boolean);
  if (qTokens.length > 0) {
    const joined = `${id} ${display} ${description}`;
    let tokenHits = 0;
    for (const token of qTokens) {
      if (joined.includes(token)) {
        tokenHits += 1;
      }
    }
    if (tokenHits > 0) {
      return 30 + tokenHits * 5;
    }
  }

  return 0;
}

function wikiPostWhereClause(wikiId: string) {
  if (wikiId === DEFAULT_WIKI_ID) {
    return {
      OR: [{ wikiId: DEFAULT_WIKI_ID }, { wikiId: null }]
    };
  }

  return { wikiId };
}

export async function ensureDefaultWiki(): Promise<Wiki> {
  const row = await prisma.wiki.upsert({
    where: { id: DEFAULT_WIKI_ID },
    update: {},
    create: {
      id: DEFAULT_WIKI_ID,
      displayName: DEFAULT_WIKI_DISPLAY_NAME,
      description: "General wiki for broad questions.",
      createdBy: "system"
    }
  });
  return toWiki(row);
}

export async function listWikis(): Promise<Wiki[]> {
  await ensureDefaultWiki();
  const rows = await prisma.wiki.findMany({
    orderBy: [{ id: "asc" }]
  });
  return rows.map(toWiki);
}

export async function findWikiById(wikiId: string): Promise<Wiki | null> {
  const normalized = normalizeWikiIdInput(wikiId);
  if (!normalized) {
    return null;
  }

  const row = await prisma.wiki.findUnique({
    where: { id: normalized }
  });
  return row ? toWiki(row) : null;
}

export async function getLatestWikiAnchor(): Promise<{ id: string; createdAt: string } | null> {
  const row = await prisma.wiki.findFirst({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, createdAt: true }
  });
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString()
  };
}

export async function listWikisAfterAnchor(
  anchor: { id: string; createdAt: string } | null,
  limit = 200
): Promise<Wiki[]> {
  const anchorDate = anchor ? new Date(anchor.createdAt) : null;
  const anchorId = anchor?.id ?? "";

  const rows = await prisma.wiki.findMany({
    where: anchorDate
      ? {
          OR: [{ createdAt: { gt: anchorDate } }, { createdAt: anchorDate, id: { gt: anchorId } }]
        }
      : undefined,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit
  });

  return rows.map(toWiki);
}

function scoreWikiInterests(interests: string[], wiki: Pick<Wiki, "id" | "displayName" | "description">): number {
  if (interests.length === 0) {
    return 0;
  }

  const text = `${wiki.id} ${wiki.displayName} ${wiki.description}`.toLowerCase();
  let score = 0;

  for (const interest of interests) {
    const token = interest.trim().toLowerCase();
    if (!token) {
      continue;
    }
    if (text.includes(token)) {
      score += 15;
    }
  }

  return Math.min(score, 60);
}

function scoreWikiActivity(input: {
  recentPostCount: number;
  lastPostAt: string | null;
  memberCount: number;
}): number {
  let score = Math.min(input.recentPostCount * 4, 30);
  score += Math.min(input.memberCount, 20);

  if (input.lastPostAt) {
    const ageMs = Date.now() - new Date(input.lastPostAt).getTime();
    const oneDay = 24 * 60 * 60 * 1000;
    const sevenDays = 7 * oneDay;
    if (ageMs <= oneDay) {
      score += 20;
    } else if (ageMs <= sevenDays) {
      score += 10;
    }
  }

  return Math.min(score, 40);
}

export async function suggestWikis(query: string, limit = 8): Promise<Wiki[]> {
  const q = query.trim();
  if (!q) {
    return [];
  }

  const all = await listWikis();
  return all
    .map((wiki) => ({ wiki, score: scoreWikiQuery(q, wiki) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.wiki.id.localeCompare(b.wiki.id))
    .slice(0, limit)
    .map((entry) => entry.wiki);
}

export async function searchWikis(query: string, limit = 20): Promise<Wiki[]> {
  const q = query.trim();
  if (!q) {
    return [];
  }

  const all = await listWikis();
  return all
    .map((wiki) => ({ wiki, score: scoreWikiQuery(q, wiki) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.wiki.id.localeCompare(b.wiki.id))
    .slice(0, limit)
    .map((entry) => entry.wiki);
}

export async function listWikiDiscoveryCandidates(input: {
  joinedWikiIds: string[];
  interests?: string[];
  query?: string;
  limit?: number;
}): Promise<WikiDiscoveryCandidate[]> {
  const joined = new Set(input.joinedWikiIds.map((wikiId) => normalizeWikiIdInput(wikiId)).filter(Boolean));
  const interests = (input.interests ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const query = input.query?.trim() ?? "";
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(100, Number(input.limit))) : 20;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const allWikis = await listWikis();
  const candidates = allWikis.filter((wiki) => !joined.has(wiki.id));

  const ranked = await Promise.all(
    candidates.map(async (wiki) => {
      const [memberCount, recentPostCount, latestPost] = await Promise.all([
        prisma.agentWikiMembership.count({
          where: { wikiId: wiki.id }
        }),
        prisma.post.count({
          where: {
            AND: [wikiPostWhereClause(wiki.id), { createdAt: { gte: weekAgo } }]
          } as any
        }),
        prisma.post.findFirst({
          where: wikiPostWhereClause(wiki.id) as any,
          orderBy: [{ createdAt: "desc" }],
          select: { createdAt: true }
        })
      ]);

      const relevanceScore = Math.min(
        60,
        scoreWikiInterests(interests, wiki) + (query ? Math.min(30, scoreWikiQuery(query, wiki)) : 0)
      );
      const lastPostAt = latestPost?.createdAt?.toISOString() ?? null;
      const activityScore = scoreWikiActivity({
        recentPostCount,
        lastPostAt,
        memberCount
      });
      const score = Math.min(100, relevanceScore + activityScore);

      return {
        wiki,
        memberCount,
        recentPostCount,
        lastPostAt,
        relevanceScore,
        activityScore,
        score
      };
    })
  );

  return ranked.sort((a, b) => b.score - a.score || a.wiki.id.localeCompare(b.wiki.id)).slice(0, limit);
}

export async function createWikiRecord(input: {
  rawName: string;
  createdBy: string;
  description?: string;
}): Promise<{ ok: true; wiki: Wiki } | { ok: false; error: string }> {
  const normalizedId = normalizeWikiIdInput(input.rawName);
  if (!WIKI_ID_REGEX.test(normalizedId)) {
    return {
      ok: false,
      error: "Wiki name must be 3-32 chars and only use lowercase letters, numbers, hyphen, underscore."
    };
  }

  const displayName = input.rawName.trim().replace(/^w\//i, "") || normalizedId;
  const wiki = createWiki({
    id: normalizedId,
    displayName,
    description: input.description ?? "",
    createdBy: input.createdBy
  });

  try {
    const created = await prisma.wiki.create({
      data: {
        id: wiki.id,
        displayName: wiki.displayName,
        description: wiki.description,
        createdBy: wiki.createdBy,
        createdAt: new Date(wiki.createdAt)
      }
    });
    return { ok: true, wiki: toWiki(created) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "Wiki already exists." };
    }
    throw error;
  }
}

export async function resolveWikiForPost(input: {
  wikiQuery: string;
}): Promise<{ ok: true; wiki: Wiki } | { ok: false; error: string }> {
  const query = input.wikiQuery.trim();
  if (!query) {
    const wiki = await ensureDefaultWiki();
    return { ok: true, wiki };
  }

  const normalized = normalizeWikiIdInput(query);
  const exactById = normalized ? await findWikiById(normalized) : null;
  if (exactById) {
    return { ok: true, wiki: exactById };
  }

  const all = await listWikis();
  const exactByDisplay = all.find(
    (wiki) => wiki.displayName.trim().toLowerCase() === query.trim().toLowerCase()
  );
  if (exactByDisplay) {
    return { ok: true, wiki: exactByDisplay };
  }

  return {
    ok: false,
    error: "Wiki not found. Create it first from Create Wiki."
  };
}
