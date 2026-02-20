// User
export type User = {
  walletAddress: string;
  username: string;
  createdAt: string;
};

export function createUser(input: { walletAddress: string; username: string }): User {
  return {
    walletAddress: input.walletAddress.toLowerCase(),
    username: input.username,
    createdAt: new Date().toISOString()
  };
}

// Post
export type Post = {
  id: string;
  poster: string;
  wikiId: string;
  wikiDisplayName: string;
  header: string;
  content: string;
  createdAt: string;
  requiredBidCents: number;
  complexityTier: "simple" | "medium" | "complex";
  complexityScore: number;
  complexityModel: string | null;
  answerWindowSeconds: number;
  answersCloseAt: string;
  settlementStatus: "open" | "settled";
  winnerAnswerId: string | null;
  winnerAgentId: string | null;
  settledAt: string | null;
  settlementTxHash: string | null;
  poolTotalCents: number;
  winnerPayoutCents: number;
  platformFeeCents: number;
  answerCount: number;
};

export function createPost(input: {
  poster: string;
  wikiId?: string;
  wikiDisplayName?: string;
  header: string;
  content: string;
  requiredBidCents?: number;
  complexityTier?: "simple" | "medium" | "complex";
  complexityScore?: number;
  complexityModel?: string | null;
  answerWindowSeconds?: number;
}): Post {
  const now = new Date();
  const answerWindowSeconds = Number.isFinite(input.answerWindowSeconds) ? Math.floor(input.answerWindowSeconds ?? 300) : 300;
  const answersCloseAt = new Date(now.getTime() + answerWindowSeconds * 1000);

  return {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    poster: input.poster.trim() || "anonymous",
    wikiId: input.wikiId?.trim().toLowerCase() || "general",
    wikiDisplayName: input.wikiDisplayName?.trim() || "General",
    header: input.header.trim(),
    content: input.content.trim(),
    createdAt: now.toISOString(),
    requiredBidCents: Math.max(1, Math.floor(input.requiredBidCents ?? 75)),
    complexityTier: input.complexityTier ?? "medium",
    complexityScore: Math.min(5, Math.max(1, Math.floor(input.complexityScore ?? 3))),
    complexityModel: input.complexityModel ?? null,
    answerWindowSeconds,
    answersCloseAt: answersCloseAt.toISOString(),
    settlementStatus: "open",
    winnerAnswerId: null,
    winnerAgentId: null,
    settledAt: null,
    settlementTxHash: null,
    poolTotalCents: 0,
    winnerPayoutCents: 0,
    platformFeeCents: 0,
    answerCount: 0
  };
}

// Answer
export type Answer = {
  id: string;
  postId: string;
  agentId: string;
  agentName: string;
  content: string;
  bidAmountCents: number;
  paymentNetwork: string;
  paymentTxHash: string | null;
  createdAt: string;
};

export function createAnswer(input: {
  postId: string;
  agentId: string;
  agentName: string;
  content: string;
  bidAmountCents: number;
  paymentNetwork: string;
  paymentTxHash?: string | null;
}): Answer {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    postId: input.postId,
    agentId: input.agentId,
    agentName: input.agentName,
    content: input.content.trim(),
    bidAmountCents: input.bidAmountCents,
    paymentNetwork: input.paymentNetwork,
    paymentTxHash: input.paymentTxHash?.trim() || null,
    createdAt: new Date().toISOString()
  };
}

// Agent
export type AgentTransport = "http" | "sse" | "stdio";
export type AgentVerificationStatus = "verified" | "failed";

export type Agent = {
  id: string;
  ownerWalletAddress: string;
  ownerUsername: string;
  name: string;
  description: string;
  baseWalletAddress: string | null;
  mcpServerUrl: string;
  transport: AgentTransport;
  entrypointCommand: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  status: "active" | "paused";
  authTokenHash: string;
  verificationStatus: AgentVerificationStatus;
  verificationError: string | null;
  verifiedAt: string | null;
  capabilities: string[];
};

export function createAgent(input: {
  ownerWalletAddress: string;
  ownerUsername: string;
  name: string;
  description: string;
  baseWalletAddress?: string;
  mcpServerUrl: string;
  transport: AgentTransport;
  entrypointCommand?: string;
  tags?: string[];
  authTokenHash: string;
  verificationStatus: AgentVerificationStatus;
  verificationError?: string | null;
  verifiedAt?: string | null;
  capabilities?: string[];
}): Agent {
  const now = new Date().toISOString();

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ownerWalletAddress: input.ownerWalletAddress.toLowerCase(),
    ownerUsername: input.ownerUsername,
    name: input.name.trim(),
    description: input.description.trim(),
    baseWalletAddress: input.baseWalletAddress?.toLowerCase() ?? null,
    mcpServerUrl: input.mcpServerUrl.trim(),
    transport: input.transport,
    entrypointCommand: input.entrypointCommand?.trim() ? input.entrypointCommand.trim() : null,
    tags: (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
    createdAt: now,
    updatedAt: now,
    status: "active",
    authTokenHash: input.authTokenHash,
    verificationStatus: input.verificationStatus,
    verificationError: input.verificationError ?? null,
    verifiedAt: input.verifiedAt ?? null,
    capabilities: input.capabilities ?? []
  };
}

export type PublicAgent = Omit<Agent, "authTokenHash">;

export function toPublicAgent(agent: Agent): PublicAgent {
  const { authTokenHash: _ignored, ...publicAgent } = agent;
  return publicAgent;
}

export type Wiki = {
  id: string;
  displayName: string;
  description: string;
  createdBy: string;
  createdAt: string;
};

export type WikiDiscoveryCandidate = {
  wiki: Wiki;
  memberCount: number;
  recentPostCount: number;
  lastPostAt: string | null;
  relevanceScore: number;
  activityScore: number;
  score: number;
};

export type AgentWikiMembership = {
  id: string;
  agentId: string;
  wikiId: string;
  subscribedAt: string;
};

export function createWiki(input: {
  id: string;
  displayName: string;
  description?: string;
  createdBy: string;
}): Wiki {
  return {
    id: input.id.trim().toLowerCase(),
    displayName: input.displayName.trim(),
    description: input.description?.trim() ?? "",
    createdBy: input.createdBy.trim() || "system",
    createdAt: new Date().toISOString()
  };
}

export function createAgentWikiMembership(input: {
  agentId: string;
  wikiId: string;
}): AgentWikiMembership {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    agentId: input.agentId,
    wikiId: input.wikiId,
    subscribedAt: new Date().toISOString()
  };
}
