import { promises as fs } from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const root = process.cwd();

function toDate(value) {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function readJsonLines(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

async function migrateUsers() {
  const usersPath = path.join(root, "data", "users.txt");
  const rows = await readJsonLines(usersPath);
  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const walletAddress = String(row?.walletAddress ?? "").toLowerCase();
    const username = String(row?.username ?? "").trim();
    if (!walletAddress || !username) {
      skipped += 1;
      continue;
    }

    try {
      await prisma.user.upsert({
        where: { walletAddress },
        update: {
          username,
          createdAt: toDate(row?.createdAt)
        },
        create: {
          walletAddress,
          username,
          createdAt: toDate(row?.createdAt)
        }
      });
      migrated += 1;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  return { migrated, skipped };
}

async function migratePosts() {
  const postsPath = path.join(root, "data", "posts.txt");
  const rows = await readJsonLines(postsPath);
  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = String(row?.id ?? "").trim();
    const poster = String(row?.poster ?? "anonymous").trim() || "anonymous";
    const header = String(row?.header ?? "").trim();
    const content = String(row?.content ?? "").trim();
    const createdAt = toDate(row?.createdAt);
    const answerWindowSeconds = Number.isFinite(Number(row?.answerWindowSeconds))
      ? Math.max(60, Math.min(3600, Math.floor(Number(row.answerWindowSeconds))))
      : 300;
    const answersCloseAt = row?.answersCloseAt
      ? toDate(row.answersCloseAt)
      : new Date(createdAt.getTime() + answerWindowSeconds * 1000);
    const requiredBidCents = Number.isFinite(Number(row?.requiredBidCents))
      ? Math.max(1, Math.floor(Number(row.requiredBidCents)))
      : 75;
    const complexityTier =
      String(row?.complexityTier ?? "medium").toLowerCase() === "simple" ||
      String(row?.complexityTier ?? "medium").toLowerCase() === "complex"
        ? String(row?.complexityTier).toLowerCase()
        : "medium";
    const complexityScore = Number.isFinite(Number(row?.complexityScore))
      ? Math.max(1, Math.min(5, Math.floor(Number(row.complexityScore))))
      : 3;
    const complexityModel = row?.complexityModel ? String(row.complexityModel) : null;

    if (!id || !header || !content) {
      skipped += 1;
      continue;
    }

    await prisma.post.upsert({
      where: { id },
      update: {
        poster,
        header,
        content,
        createdAt,
        requiredBidCents,
        complexityTier,
        complexityScore,
        complexityModel,
        answerWindowSeconds,
        answersCloseAt,
        settlementStatus: String(row?.settlementStatus ?? "open"),
        winnerAnswerId: row?.winnerAnswerId ? String(row.winnerAnswerId) : null,
        winnerAgentId: row?.winnerAgentId ? String(row.winnerAgentId) : null,
        settledAt: row?.settledAt ? toDate(row.settledAt) : null,
        settlementTxHash: row?.settlementTxHash ? String(row.settlementTxHash) : null,
        poolTotalCents: Number.isFinite(Number(row?.poolTotalCents)) ? Math.max(0, Math.floor(Number(row.poolTotalCents))) : 0,
        winnerPayoutCents: Number.isFinite(Number(row?.winnerPayoutCents))
          ? Math.max(0, Math.floor(Number(row.winnerPayoutCents)))
          : 0,
        platformFeeCents: Number.isFinite(Number(row?.platformFeeCents))
          ? Math.max(0, Math.floor(Number(row.platformFeeCents)))
          : 0
      },
      create: {
        id,
        poster,
        header,
        content,
        createdAt,
        requiredBidCents,
        complexityTier,
        complexityScore,
        complexityModel,
        answerWindowSeconds,
        answersCloseAt,
        settlementStatus: String(row?.settlementStatus ?? "open"),
        winnerAnswerId: row?.winnerAnswerId ? String(row.winnerAnswerId) : null,
        winnerAgentId: row?.winnerAgentId ? String(row.winnerAgentId) : null,
        settledAt: row?.settledAt ? toDate(row.settledAt) : null,
        settlementTxHash: row?.settlementTxHash ? String(row.settlementTxHash) : null,
        poolTotalCents: Number.isFinite(Number(row?.poolTotalCents)) ? Math.max(0, Math.floor(Number(row.poolTotalCents))) : 0,
        winnerPayoutCents: Number.isFinite(Number(row?.winnerPayoutCents))
          ? Math.max(0, Math.floor(Number(row.winnerPayoutCents)))
          : 0,
        platformFeeCents: Number.isFinite(Number(row?.platformFeeCents))
          ? Math.max(0, Math.floor(Number(row.platformFeeCents)))
          : 0
      }
    });
    migrated += 1;
  }

  return { migrated, skipped };
}

async function migrateAgents() {
  const agentsPath = path.join(root, "data", "agents.txt");
  const rows = await readJsonLines(agentsPath);
  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = String(row?.id ?? "").trim();
    const ownerWalletAddress = String(row?.ownerWalletAddress ?? "").toLowerCase();
    const ownerUsername = String(row?.ownerUsername ?? "").trim();
    const name = String(row?.name ?? "").trim();
    const description = String(row?.description ?? "").trim();
    const baseWalletAddress = String(row?.baseWalletAddress ?? "").toLowerCase().trim() || ownerWalletAddress;
    const mcpServerUrl = String(row?.mcpServerUrl ?? "").trim();

    if (!id || !ownerWalletAddress || !ownerUsername || !name || !description || !mcpServerUrl || !baseWalletAddress) {
      skipped += 1;
      continue;
    }

    await prisma.agent.upsert({
      where: { id },
      update: {
        ownerWalletAddress,
        ownerUsername,
        name,
        description,
        baseWalletAddress,
        mcpServerUrl,
        transport: String(row?.transport ?? "http"),
        entrypointCommand: row?.entrypointCommand ? String(row.entrypointCommand) : null,
        tags: Array.isArray(row?.tags) ? row.tags.map((tag) => String(tag)) : [],
        createdAt: toDate(row?.createdAt),
        updatedAt: toDate(row?.updatedAt ?? row?.createdAt),
        status: String(row?.status ?? "active"),
        authTokenHash: String(row?.authTokenHash ?? ""),
        verificationStatus: String(row?.verificationStatus ?? "verified"),
        verificationError: row?.verificationError ? String(row.verificationError) : null,
        verifiedAt: row?.verifiedAt ? toDate(row.verifiedAt) : null,
        capabilities: Array.isArray(row?.capabilities) ? row.capabilities.map((cap) => String(cap)) : []
      },
      create: {
        id,
        ownerWalletAddress,
        ownerUsername,
        name,
        description,
        baseWalletAddress,
        mcpServerUrl,
        transport: String(row?.transport ?? "http"),
        entrypointCommand: row?.entrypointCommand ? String(row.entrypointCommand) : null,
        tags: Array.isArray(row?.tags) ? row.tags.map((tag) => String(tag)) : [],
        createdAt: toDate(row?.createdAt),
        updatedAt: toDate(row?.updatedAt ?? row?.createdAt),
        status: String(row?.status ?? "active"),
        authTokenHash: String(row?.authTokenHash ?? ""),
        verificationStatus: String(row?.verificationStatus ?? "verified"),
        verificationError: row?.verificationError ? String(row.verificationError) : null,
        verifiedAt: row?.verifiedAt ? toDate(row.verifiedAt) : null,
        capabilities: Array.isArray(row?.capabilities) ? row.capabilities.map((cap) => String(cap)) : []
      }
    });
    migrated += 1;
  }

  return { migrated, skipped };
}

async function migrateAnswers() {
  const answersPath = path.join(root, "data", "answers.txt");
  const rows = await readJsonLines(answersPath);
  let migrated = 0;
  let skipped = 0;

  const [posts, agents] = await Promise.all([
    prisma.post.findMany({ select: { id: true } }),
    prisma.agent.findMany({ select: { id: true } })
  ]);
  const postIds = new Set(posts.map((post) => post.id));
  const agentIds = new Set(agents.map((agent) => agent.id));

  for (const row of rows) {
    const id = String(row?.id ?? "").trim();
    const postId = String(row?.postId ?? "").trim();
    const agentId = String(row?.agentId ?? "").trim();
    const agentName = String(row?.agentName ?? "").trim();
    const content = String(row?.content ?? "").trim();
    const bidAmountCents = Number.isFinite(Number(row?.bidAmountCents))
      ? Math.max(1, Math.floor(Number(row.bidAmountCents)))
      : 10;
    const paymentNetwork = String(row?.paymentNetwork ?? "eip155:8453");

    if (!id || !postId || !agentId || !agentName || !content) {
      skipped += 1;
      continue;
    }

    if (!postIds.has(postId) || !agentIds.has(agentId)) {
      skipped += 1;
      continue;
    }

    try {
      await prisma.answer.upsert({
        where: { id },
        update: {
          postId,
          agentId,
          agentName,
          content,
          bidAmountCents,
          paymentNetwork,
          createdAt: toDate(row?.createdAt)
        },
        create: {
          id,
          postId,
          agentId,
          agentName,
          content,
          bidAmountCents,
          paymentNetwork,
          createdAt: toDate(row?.createdAt)
        }
      });
      migrated += 1;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  return { migrated, skipped };
}

async function main() {
  const users = await migrateUsers();
  const posts = await migratePosts();
  const agents = await migrateAgents();
  const answers = await migrateAnswers();

  console.log("Backfill complete");
  console.log(`users: migrated=${users.migrated} skipped=${users.skipped}`);
  console.log(`posts: migrated=${posts.migrated} skipped=${posts.skipped}`);
  console.log(`agents: migrated=${agents.migrated} skipped=${agents.skipped}`);
  console.log(`answers: migrated=${answers.migrated} skipped=${answers.skipped}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
