import crypto from "node:crypto";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { privateKeyToAccount } from "viem/accounts";
import { loadLocalEnv } from "./load-local-env.mjs";

loadLocalEnv();

if (!process.env.DATABASE_URL && (process.env.DIRECT_URL ?? "").trim()) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const prisma = new PrismaClient();

const SOURCE_CONFIG_PATH = path.resolve(
  String(process.env.REAL_AGENT_SOURCE_CONFIG ?? "test/real-agents.local.json").trim()
);
const TARGET_CONFIG_PATH = path.resolve(
  String(process.env.REAL_AGENT_REGISTRY_PATH ?? "test/real-agents.local.json").trim()
);
const REAL_AGENT_COUNT = 5;
const DEFAULT_OWNER_WALLET = "0x1111111111111111111111111111111111111111";
const DEFAULT_OWNER_USERNAME = "local_test_owner";
const DEFAULT_WIKI_ID = "general";
const DEFAULT_MCP_URL = String(process.env.REAL_AGENT_MCP_URL ?? "http://localhost:8790/mcp").trim();

function fail(message) {
  console.error(message);
  process.exit(1);
}

function nowId(prefix = "") {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateAgentToken() {
  return `ag_${crypto.randomBytes(24).toString("hex")}`;
}

async function readSourceAgents() {
  const raw = await readFile(SOURCE_CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw);
  const agents = Array.isArray(parsed?.agents) ? parsed.agents : [];
  if (agents.length < REAL_AGENT_COUNT) {
    fail(`Source config needs at least ${REAL_AGENT_COUNT} agents: ${SOURCE_CONFIG_PATH}`);
  }
  return agents.slice(0, REAL_AGENT_COUNT);
}

async function ensureDefaultWiki() {
  await prisma.wiki.upsert({
    where: { id: DEFAULT_WIKI_ID },
    update: {},
    create: {
      id: DEFAULT_WIKI_ID,
      displayName: "General",
      description: "General wiki for broad questions.",
      createdBy: "system"
    }
  });
}

async function ensureDefaultWikiMembership(agentId) {
  await ensureDefaultWiki();
  await prisma.agentWikiMembership.upsert({
    where: { agentId_wikiId: { agentId, wikiId: DEFAULT_WIKI_ID } },
    update: {},
    create: {
      id: nowId("awm_"),
      agentId,
      wikiId: DEFAULT_WIKI_ID,
      subscribedAt: new Date()
    }
  });
}

async function upsertAgent(input) {
  const existing = await prisma.agent.findFirst({
    where: {
      ownerWalletAddress: input.ownerWalletAddress,
      name: { equals: input.name, mode: "insensitive" }
    },
    orderBy: { createdAt: "asc" }
  });

  const now = new Date();
  if (existing) {
    const updated = await prisma.agent.update({
      where: { id: existing.id },
      data: {
        description: input.description,
        totalLikes: 0,
        baseWalletAddress: input.baseWalletAddress,
        mcpServerUrl: input.mcpServerUrl,
        transport: "http",
        entrypointCommand: null,
        tags: input.tags,
        updatedAt: now,
        status: "active",
        authTokenHash: input.authTokenHash,
        verificationStatus: "verified",
        verificationError: null,
        verifiedAt: now,
        capabilities: input.capabilities
      }
    });
    return updated;
  }

  return prisma.agent.create({
    data: {
      id: nowId("agnt_"),
      ownerWalletAddress: input.ownerWalletAddress,
      ownerUsername: input.ownerUsername,
      name: input.name,
      description: input.description,
      totalLikes: 0,
      baseWalletAddress: input.baseWalletAddress,
      mcpServerUrl: input.mcpServerUrl,
      transport: "http",
      entrypointCommand: null,
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
      status: "active",
      authTokenHash: input.authTokenHash,
      verificationStatus: "verified",
      verificationError: null,
      verifiedAt: now,
      capabilities: input.capabilities
    }
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    fail("Missing DATABASE_URL (or DIRECT_URL).");
  }

  const sourceAgents = await readSourceAgents();
  const out = [];

  for (let index = 0; index < sourceAgents.length; index += 1) {
    const source = sourceAgents[index];
    const name = String(source?.name ?? `real-openclaw-${index + 1}`).trim();
    const basePrivateKey = String(source?.basePrivateKey ?? "").trim();
    if (!basePrivateKey) fail(`Agent ${name} is missing basePrivateKey in source config.`);
    const baseWalletAddress = privateKeyToAccount(basePrivateKey).address;
    const accessToken = String(source?.accessToken ?? "").trim() || generateAgentToken();
    const authTokenHash = hashToken(accessToken);
    const personaSpecialties = Array.isArray(source?.personaProfile?.specialties)
      ? source.personaProfile.specialties.map((entry) => String(entry).trim()).filter(Boolean)
      : [];
    const tags = ["real-agent", "cognitive", ...personaSpecialties].slice(0, 16);
    const capabilities = ["tools", "cognitive-loop", "heartbeat", "real-agent"];
    const ownerWalletAddress = String(source?.ownerWalletAddress ?? DEFAULT_OWNER_WALLET).trim().toLowerCase();
    const ownerUsername = String(source?.ownerUsername ?? DEFAULT_OWNER_USERNAME).trim();

    const record = await upsertAgent({
      ownerWalletAddress,
      ownerUsername,
      name,
      description: String(source?.description ?? `${name} real autonomous agent`).trim(),
      baseWalletAddress,
      mcpServerUrl: String(source?.mcpServerUrl ?? DEFAULT_MCP_URL).trim() || DEFAULT_MCP_URL,
      authTokenHash,
      tags,
      capabilities
    });
    await ensureDefaultWikiMembership(record.id);

    out.push({
      id: record.id,
      name,
      ownerWalletAddress: record.ownerWalletAddress,
      ownerUsername: record.ownerUsername,
      description: record.description,
      tags,
      capabilities,
      accessToken,
      basePrivateKey,
      baseWalletAddress,
      mcpServerUrl: record.mcpServerUrl,
      personaProfile: source?.personaProfile ?? null
    });
    console.log(`upserted real agent: ${name} id=${record.id}`);
  }

  await writeFile(
    TARGET_CONFIG_PATH,
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        notes: "Canonical 5 real cognitive agents.",
        agents: out
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(`Wrote real-agent registry with ${out.length} agents: ${TARGET_CONFIG_PATH}`);
  console.log("Next: npm run agent:real:run");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
