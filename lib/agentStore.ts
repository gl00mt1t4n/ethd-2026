import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { verifyAgentConnection } from "@/lib/agentConnection";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WIKI_ID, ensureDefaultWiki, findWikiById, normalizeWikiIdInput } from "@/lib/wikiStore";
import {
  createAgent,
  createAgentWikiMembership,
  toPublicAgent,
  type Agent,
  type AgentTransport,
  type PublicAgent
} from "@/lib/types";

function isWalletAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isValidTransport(value: string): value is AgentTransport {
  return value === "http" || value === "sse" || value === "stdio";
}

function isValidMcpEndpoint(value: string): boolean {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return true;
  }

  if (value.startsWith("stdio://")) {
    return true;
  }

  return false;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateAgentToken(): string {
  return `ag_${crypto.randomBytes(24).toString("hex")}`;
}

function toAgent(record: {
  id: string;
  ownerWalletAddress: string;
  ownerUsername: string;
  name: string;
  description: string;
  baseWalletAddress?: string | null;
  mcpServerUrl: string;
  transport: string;
  entrypointCommand: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  status: string;
  authTokenHash: string;
  verificationStatus: string;
  verificationError: string | null;
  verifiedAt: Date | null;
  capabilities: string[];
}): Agent {
  return {
    id: record.id,
    ownerWalletAddress: record.ownerWalletAddress,
    ownerUsername: record.ownerUsername,
    name: record.name,
    description: record.description,
    baseWalletAddress: record.baseWalletAddress ?? null,
    mcpServerUrl: record.mcpServerUrl,
    transport: record.transport as AgentTransport,
    entrypointCommand: record.entrypointCommand,
    tags: record.tags,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    status: record.status as "active" | "paused",
    authTokenHash: record.authTokenHash,
    verificationStatus: record.verificationStatus as "verified" | "failed",
    verificationError: record.verificationError,
    verifiedAt: record.verifiedAt?.toISOString() ?? null,
    capabilities: record.capabilities
  };
}

export async function listAgentsRaw(): Promise<Agent[]> {
  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: "desc" }
  });
  return agents.map((agent) => toAgent(agent as any));
}

export async function listAgents(): Promise<PublicAgent[]> {
  const all = await listAgentsRaw();
  return all.map(toPublicAgent);
}

export type AgentLeaderboardMetrics = {
  agentId: string;
  replies: number;
  wins: number;
  winRate: number;
  yieldCents: number;
};

export async function getAgentLeaderboardMetrics(): Promise<Map<string, AgentLeaderboardMetrics>> {
  const [replyCounts, winData] = await Promise.all([
    prisma.answer.groupBy({
      by: ["agentId"],
      _count: { id: true }
    }),
    prisma.post.groupBy({
      by: ["winnerAgentId"],
      where: {
        winnerAgentId: { not: null },
        settlementStatus: "settled"
      },
      _count: { id: true },
      _sum: { winnerPayoutCents: true }
    })
  ]);

  const metricsMap = new Map<string, AgentLeaderboardMetrics>();

  for (const reply of replyCounts) {
    metricsMap.set(reply.agentId, {
      agentId: reply.agentId,
      replies: reply._count.id,
      wins: 0,
      winRate: 0,
      yieldCents: 0
    });
  }

  for (const win of winData) {
    if (!win.winnerAgentId) continue;
    
    const existing = metricsMap.get(win.winnerAgentId);
    const wins = win._count.id;
    const yieldCents = win._sum.winnerPayoutCents ?? 0;
    
    if (existing) {
      existing.wins = wins;
      existing.winRate = existing.replies > 0 ? (wins / existing.replies) * 100 : 0;
      existing.yieldCents = yieldCents;
    } else {
      metricsMap.set(win.winnerAgentId, {
        agentId: win.winnerAgentId,
        replies: 0,
        wins,
        winRate: 0,
        yieldCents
      });
    }
  }

  return metricsMap;
}

export async function listAgentsByOwner(ownerWalletAddress: string): Promise<PublicAgent[]> {
  const normalized = ownerWalletAddress.toLowerCase();
  const agents = await prisma.agent.findMany({
    where: { ownerWalletAddress: normalized },
    orderBy: { createdAt: "desc" }
  });
  return agents.map((agent) => toAgent(agent as any)).map(toPublicAgent);
}

export async function listAgentSubscribedWikiIds(agentId: string): Promise<string[]> {
  await ensureDefaultWiki();
  const memberships = await prisma.agentWikiMembership.findMany({
    where: { agentId },
    select: { wikiId: true },
    orderBy: [{ subscribedAt: "asc" }]
  });
  return memberships.map((entry) => entry.wikiId);
}

export async function ensureAgentDefaultWikiMembership(agentId: string): Promise<void> {
  await ensureDefaultWiki();
  const membership = createAgentWikiMembership({
    agentId,
    wikiId: DEFAULT_WIKI_ID
  });

  await prisma.agentWikiMembership.upsert({
    where: {
      agentId_wikiId: {
        agentId,
        wikiId: DEFAULT_WIKI_ID
      }
    },
    update: {},
    create: {
      id: membership.id,
      agentId: membership.agentId,
      wikiId: membership.wikiId,
      subscribedAt: new Date(membership.subscribedAt)
    }
  });
}

export async function joinAgentWiki(input: {
  agentId: string;
  wikiQuery: string;
}): Promise<{ ok: true; wikiId: string } | { ok: false; error: string }> {
  const wikiId = normalizeWikiIdInput(input.wikiQuery);
  if (!wikiId) {
    return { ok: false, error: "Wiki id is required." };
  }

  const wiki = await findWikiById(wikiId);
  if (!wiki) {
    return { ok: false, error: "Wiki not found." };
  }

  const membership = createAgentWikiMembership({
    agentId: input.agentId,
    wikiId
  });

  try {
    await prisma.agentWikiMembership.create({
      data: {
        id: membership.id,
        agentId: membership.agentId,
        wikiId: membership.wikiId,
        subscribedAt: new Date(membership.subscribedAt)
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: true, wikiId };
    }
    throw error;
  }

  return { ok: true, wikiId };
}

export async function leaveAgentWiki(input: {
  agentId: string;
  wikiQuery: string;
}): Promise<{ ok: true; wikiId: string } | { ok: false; error: string }> {
  const wikiId = normalizeWikiIdInput(input.wikiQuery);
  if (!wikiId) {
    return { ok: false, error: "Wiki id is required." };
  }

  await prisma.agentWikiMembership.deleteMany({
    where: {
      agentId: input.agentId,
      wikiId
    }
  });

  return { ok: true, wikiId };
}

export async function findAgentByAccessToken(token: string): Promise<Agent | null> {
  const tokenHash = hashToken(token);
  const agent = await prisma.agent.findUnique({
    where: { authTokenHash: tokenHash }
  });
  if (!agent) {
    return null;
  }
  await ensureAgentDefaultWikiMembership(agent.id);
  return toAgent(agent as any);
}

export async function findAgentById(agentId: string): Promise<Agent | null> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  return agent ? toAgent(agent as any) : null;
}

export async function registerAgent(input: {
  ownerWalletAddress: string;
  ownerUsername: string;
  name: string;
  description: string;
  baseWalletAddress: string;
  mcpServerUrl: string;
  transport: string;
  entrypointCommand?: string;
  tags?: string[];
}): Promise<
  | { ok: true; agent: PublicAgent; agentAccessToken: string }
  | { ok: false; error: string }
> {
  const name = input.name.trim();
  const description = input.description.trim();
  const baseWalletAddress = input.baseWalletAddress.trim().toLowerCase();
  const mcpServerUrl = input.mcpServerUrl.trim();
  const transport = input.transport.trim().toLowerCase();

  if (name.length < 3 || name.length > 80) {
    return { ok: false, error: "Agent name must be 3-80 characters." };
  }

  if (description.length < 10 || description.length > 2000) {
    return { ok: false, error: "Description must be 10-2000 characters." };
  }

  if (!isWalletAddress(baseWalletAddress)) {
    return { ok: false, error: "Base wallet address must be a valid 0x wallet." };
  }

  if (!isValidTransport(transport)) {
    return { ok: false, error: "Transport must be one of: http, sse, stdio." };
  }

  if (!isValidMcpEndpoint(mcpServerUrl)) {
    return { ok: false, error: "MCP endpoint must start with http://, https://, or stdio://" };
  }

  const duplicateName = await prisma.agent.findFirst({
    where: {
      ownerWalletAddress: input.ownerWalletAddress.toLowerCase(),
      name: {
        equals: name,
        mode: "insensitive"
      }
    },
    select: { id: true }
  });
  if (duplicateName) {
    return { ok: false, error: "You already have an agent with this name." };
  }

  const verification = await verifyAgentConnection({
    transport,
    mcpServerUrl,
    entrypointCommand: input.entrypointCommand
  });

  if (!verification.ok) {
    return { ok: false, error: verification.error ?? "Agent endpoint verification failed." };
  }

  const accessToken = generateAgentToken();
  const agent = createAgent({
    ownerWalletAddress: input.ownerWalletAddress,
    ownerUsername: input.ownerUsername,
    name,
    description,
    baseWalletAddress,
    mcpServerUrl,
    transport,
    entrypointCommand: input.entrypointCommand,
    tags: input.tags,
    authTokenHash: hashToken(accessToken),
    verificationStatus: "verified",
    verificationError: null,
    verifiedAt: new Date().toISOString(),
    capabilities: verification.capabilities ?? []
  });

  const created = await prisma.agent.create({
    data: {
      id: agent.id,
      ownerWalletAddress: agent.ownerWalletAddress,
      ownerUsername: agent.ownerUsername,
      name: agent.name,
      description: agent.description,
      baseWalletAddress: agent.baseWalletAddress,
      mcpServerUrl: agent.mcpServerUrl,
      transport: agent.transport,
      entrypointCommand: agent.entrypointCommand,
      tags: agent.tags,
      createdAt: new Date(agent.createdAt),
      updatedAt: new Date(agent.updatedAt),
      status: agent.status,
      authTokenHash: agent.authTokenHash,
      verificationStatus: agent.verificationStatus,
      verificationError: agent.verificationError,
      verifiedAt: agent.verifiedAt ? new Date(agent.verifiedAt) : null,
      capabilities: agent.capabilities
    } as any
  });

  await ensureAgentDefaultWikiMembership(created.id);

  return { ok: true, agent: toPublicAgent(toAgent(created as any)), agentAccessToken: accessToken };
}
