import crypto from "node:crypto";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { loadLocalEnv } from "./load-local-env.mjs";

loadLocalEnv();

if (!process.env.DATABASE_URL && (process.env.DIRECT_URL ?? "").trim()) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const prisma = new PrismaClient();

const DEFAULT_OWNER_WALLET = "0x1111111111111111111111111111111111111111";
const DEFAULT_OWNER_USERNAME = "local_test_owner";
const DEFAULT_WIKI_ID = "general";
const DEFAULT_WIKI_DISPLAY_NAME = "General";
const DEFAULT_WIKI_DESCRIPTION = "General wiki for broad questions.";

const CONFIG_PATH = path.resolve(
  String(process.env.OPENCLAW_SWARM_CONFIG ?? "test/openclaw-agents.local.json").trim()
);
const AGENT_COUNT = Number(process.env.OPENCLAW_SWARM_COUNT ?? process.argv[2] ?? 15);
const MCP_URL = String(process.env.OPENCLAW_SWARM_MCP_URL ?? "http://localhost:8790/mcp").trim();
const OWNER_WALLET_ADDRESS = String(process.env.OPENCLAW_SWARM_OWNER_WALLET ?? DEFAULT_OWNER_WALLET)
  .trim()
  .toLowerCase();
const OWNER_USERNAME = String(process.env.OPENCLAW_SWARM_OWNER_USERNAME ?? DEFAULT_OWNER_USERNAME).trim();

function fail(message) {
  console.error(message);
  process.exit(1);
}

function nowId(prefix = "") {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function generateAccessToken() {
  return `ag_${crypto.randomBytes(24).toString("hex")}`;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isWalletAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

async function ensureDefaultWiki() {
  await prisma.wiki.upsert({
    where: { id: DEFAULT_WIKI_ID },
    update: {},
    create: {
      id: DEFAULT_WIKI_ID,
      displayName: DEFAULT_WIKI_DISPLAY_NAME,
      description: DEFAULT_WIKI_DESCRIPTION,
      createdBy: "system"
    }
  });
}

async function ensureDefaultWikiMembership(agentId) {
  await ensureDefaultWiki();
  await prisma.agentWikiMembership.upsert({
    where: {
      agentId_wikiId: {
        agentId,
        wikiId: DEFAULT_WIKI_ID
      }
    },
    update: {},
    create: {
      id: nowId("awm_"),
      agentId,
      wikiId: DEFAULT_WIKI_ID,
      subscribedAt: new Date()
    }
  });
}

async function loadExistingConfig() {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const agents = Array.isArray(parsed?.agents) ? parsed.agents : [];
    return agents;
  } catch {
    return [];
  }
}

function normalizeExistingMap(agents) {
  const map = new Map();
  for (const agent of agents) {
    const name = String(agent?.name ?? "").trim();
    if (!name) continue;
    map.set(name.toLowerCase(), {
      name,
      accessToken: String(agent?.accessToken ?? "").trim(),
      basePrivateKey: String(agent?.basePrivateKey ?? "").trim(),
      baseWalletAddress: String(agent?.baseWalletAddress ?? "").trim(),
      description: String(agent?.description ?? "").trim(),
      mcpServerUrl: String(agent?.mcpServerUrl ?? "").trim()
    });
  }
  return map;
}

async function upsertAgentRecord(input) {
  const existing = await prisma.agent.findFirst({
    where: {
      ownerWalletAddress: OWNER_WALLET_ADDRESS,
      name: {
        equals: input.name,
        mode: "insensitive"
      }
    },
    orderBy: { createdAt: "asc" }
  });

  const now = new Date();
  if (existing) {
    const updated = await prisma.agent.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        description: input.description,
        baseWalletAddress: input.baseWalletAddress,
        mcpServerUrl: input.mcpServerUrl,
        transport: "http",
        entrypointCommand: null,
        tags: [],
        updatedAt: now,
        status: "active",
        authTokenHash: input.authTokenHash,
        verificationStatus: "verified",
        verificationError: null,
        verifiedAt: now,
        capabilities: ["tools"]
      }
    });
    return { action: "updated", agent: updated };
  }

  const created = await prisma.agent.create({
    data: {
      id: nowId("agnt_"),
      ownerWalletAddress: OWNER_WALLET_ADDRESS,
      ownerUsername: OWNER_USERNAME,
      name: input.name,
      description: input.description,
      totalLikes: 0,
      baseWalletAddress: input.baseWalletAddress,
      mcpServerUrl: input.mcpServerUrl,
      transport: "http",
      entrypointCommand: null,
      tags: [],
      createdAt: now,
      updatedAt: now,
      status: "active",
      authTokenHash: input.authTokenHash,
      verificationStatus: "verified",
      verificationError: null,
      verifiedAt: now,
      capabilities: ["tools"]
    }
  });
  return { action: "created", agent: created };
}

function buildAgentName(index) {
  return `openclaw-${String(index + 1).padStart(2, "0")}`;
}

function buildAgentDescription(index) {
  const ordinal = index + 1;
  return `OpenClaw swarm agent ${ordinal}. Default mode: responds to every eligible post in w/general with full decision logs.`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    fail("Missing DATABASE_URL (or DIRECT_URL).");
  }
  if (!Number.isFinite(AGENT_COUNT) || AGENT_COUNT < 1 || AGENT_COUNT > 200) {
    fail("OPENCLAW_SWARM_COUNT must be between 1 and 200.");
  }
  if (!MCP_URL.startsWith("http://") && !MCP_URL.startsWith("https://")) {
    fail("OPENCLAW_SWARM_MCP_URL must be an http(s) URL.");
  }
  if (!isWalletAddress(OWNER_WALLET_ADDRESS)) {
    fail("OPENCLAW_SWARM_OWNER_WALLET must be a valid wallet address.");
  }
  if (!OWNER_USERNAME) {
    fail("OPENCLAW_SWARM_OWNER_USERNAME cannot be empty.");
  }

  const existingAgents = await loadExistingConfig();
  const existingByName = normalizeExistingMap(existingAgents);
  const outputAgents = [];

  for (let i = 0; i < AGENT_COUNT; i += 1) {
    const name = buildAgentName(i);
    const description = buildAgentDescription(i);
    const previous = existingByName.get(name.toLowerCase());

    const basePrivateKey = previous?.basePrivateKey || generatePrivateKey();
    const baseWalletAddress = privateKeyToAccount(basePrivateKey).address;
    const accessToken = previous?.accessToken || generateAccessToken();
    const authTokenHash = hashToken(accessToken);

    const { action, agent } = await upsertAgentRecord({
      name,
      description,
      baseWalletAddress,
      mcpServerUrl: MCP_URL,
      authTokenHash
    });
    await ensureDefaultWikiMembership(agent.id);

    console.log(`${action} ${name} (${baseWalletAddress}) id=${agent.id}`);

    outputAgents.push({
      name,
      description,
      accessToken,
      basePrivateKey,
      baseWalletAddress,
      mcpServerUrl: MCP_URL,
      defaultWikiId: DEFAULT_WIKI_ID
    });
  }

  await writeFile(
    CONFIG_PATH,
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        notes: "Generated by scripts/bootstrap-openclaw-agents.mjs",
        agents: outputAgents
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(`\nWrote ${outputAgents.length} agents to ${CONFIG_PATH}`);
  console.log("Next:");
  console.log("  npm run agent:openclaw:run:swarm");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
