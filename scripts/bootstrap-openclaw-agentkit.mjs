import crypto from "node:crypto";
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { loadLocalEnv } from "./load-local-env.mjs";

loadLocalEnv();

if (!process.env.DATABASE_URL && (process.env.DIRECT_URL ?? "").trim()) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const prisma = new PrismaClient();

const DEFAULT_OWNER_WALLET = "0x1111111111111111111111111111111111111111";
const DEFAULT_OWNER_USERNAME = "local_test_owner";
const DEFAULT_WIKI_ID = "general";

const AGENT_NAME = String(process.env.AGENTKIT_AGENT_NAME ?? "openclaw-real-agentkit").trim();
const AGENT_DESCRIPTION = String(
  process.env.AGENTKIT_AGENT_DESCRIPTION ??
    "OpenClaw autonomous agent registered via Coinbase AgentKit wallet bootstrap."
).trim();
const AGENT_MCP_URL = String(process.env.AGENT_MCP_URL ?? "http://localhost:8795/mcp").trim();
const APP_BASE_URL = String(process.env.APP_BASE_URL ?? "http://localhost:3000").trim();
const NETWORK = String(process.env.X402_BASE_NETWORK ?? "eip155:84532").trim();
const OWNER_WALLET = String(process.env.AGENT_BOOTSTRAP_OWNER_WALLET_ADDRESS ?? DEFAULT_OWNER_WALLET)
  .trim()
  .toLowerCase();
const OWNER_USERNAME = String(process.env.AGENT_BOOTSTRAP_OWNER_USERNAME ?? DEFAULT_OWNER_USERNAME).trim();
const OUTPUT_ENV_FILE = path.resolve(String(process.env.AGENTKIT_BOOTSTRAP_ENV_FILE ?? ".env.real-agent").trim());

const CDP_API_KEY_NAME = String(process.env.CDP_API_KEY_NAME ?? "").trim();
const CDP_API_KEY_PRIVATE_KEY = String(process.env.CDP_API_KEY_PRIVATE_KEY ?? "").trim();
const CDP_NETWORK_ID = String(process.env.CDP_NETWORK_ID ?? "base-sepolia").trim();

function fail(message) {
  console.error(message);
  process.exit(1);
}

function isWalletAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
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

function renderEnvValue(value) {
  return /^[A-Za-z0-9_./:-]+$/.test(value) ? value : JSON.stringify(value);
}

async function upsertEnvFile(filePath, entries) {
  const lines = existsSync(filePath) ? (await readFile(filePath, "utf8")).split(/\r?\n/) : [];
  const keyIndex = new Map();
  const output = [...lines];

  for (let i = 0; i < output.length; i += 1) {
    const line = output[i];
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=/);
    if (match) {
      keyIndex.set(match[1], i);
    }
  }

  for (const [key, value] of Object.entries(entries)) {
    const nextLine = `${key}=${renderEnvValue(String(value))}`;
    if (keyIndex.has(key)) {
      output[keyIndex.get(key)] = nextLine;
    } else {
      output.push(nextLine);
    }
  }

  await writeFile(filePath, `${output.join("\n").replace(/\n*$/, "\n")}`, "utf8");
}

async function ensureDefaultWikiMembership(agentId) {
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

async function resolveAgentkitWalletAddress() {
  if (!CDP_API_KEY_NAME || !CDP_API_KEY_PRIVATE_KEY) {
    fail("Missing CDP_API_KEY_NAME/CDP_API_KEY_PRIVATE_KEY. Cannot initialize AgentKit wallet.");
  }

  let agentkitModule;
  try {
    agentkitModule = await import("@coinbase/agentkit");
  } catch (error) {
    fail(
      `@coinbase/agentkit is not installed or not resolvable. Install it first, then retry. Error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const privateKeyNormalized = CDP_API_KEY_PRIVATE_KEY.replace(/\\n/g, "\n");
  const exportedKeys = Object.keys(agentkitModule);
  const CdpWalletProvider = agentkitModule.CdpWalletProvider;
  if (!CdpWalletProvider) {
    fail(
      `AgentKit loaded but CdpWalletProvider export not found. Export keys=${exportedKeys.join(",")}. Update bootstrap for your AgentKit version.`
    );
  }

  let walletProvider = null;
  const attempts = [];

  const candidateCalls = [
    async () => CdpWalletProvider.configureWithWallet?.({ apiKeyName: CDP_API_KEY_NAME, apiKeyPrivateKey: privateKeyNormalized, networkId: CDP_NETWORK_ID }),
    async () => CdpWalletProvider.fromCdpApiKey?.({ apiKeyName: CDP_API_KEY_NAME, apiKeyPrivateKey: privateKeyNormalized, networkId: CDP_NETWORK_ID }),
    async () => CdpWalletProvider.configure?.({ apiKeyName: CDP_API_KEY_NAME, apiKeyPrivateKey: privateKeyNormalized, networkId: CDP_NETWORK_ID })
  ];

  for (const call of candidateCalls) {
    try {
      const maybe = await call();
      if (maybe) {
        walletProvider = maybe;
        break;
      }
    } catch (error) {
      attempts.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (!walletProvider) {
    fail(
      `Failed to initialize AgentKit wallet provider with known APIs. Errors: ${attempts.join(" | ") || "none"}`
    );
  }

  const addressCandidates = [
    async () => walletProvider.getAddress?.(),
    async () => walletProvider.getWalletAddress?.(),
    async () => walletProvider.address,
    async () => walletProvider.wallet?.address
  ];

  for (const getAddress of addressCandidates) {
    try {
      const value = await getAddress();
      const address = String(value ?? "").trim();
      if (isWalletAddress(address)) {
        return address.toLowerCase();
      }
    } catch {}
  }

  fail("AgentKit wallet provider initialized, but no valid wallet address could be resolved.");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    fail("Missing DATABASE_URL/DIRECT_URL for registration.");
  }
  if (!AGENT_NAME) {
    fail("AGENTKIT_AGENT_NAME cannot be empty.");
  }
  if (!isWalletAddress(OWNER_WALLET)) {
    fail("AGENT_BOOTSTRAP_OWNER_WALLET_ADDRESS must be a valid wallet address.");
  }

  const baseWalletAddress = await resolveAgentkitWalletAddress();
  const accessToken = generateAccessToken();
  const authTokenHash = hashToken(accessToken);
  const now = new Date();

  const existing = await prisma.agent.findFirst({
    where: {
      ownerWalletAddress: OWNER_WALLET,
      name: { equals: AGENT_NAME, mode: "insensitive" }
    },
    orderBy: { createdAt: "asc" }
  });

  const record = existing
    ? await prisma.agent.update({
        where: { id: existing.id },
        data: {
          description: AGENT_DESCRIPTION,
          baseWalletAddress,
          mcpServerUrl: AGENT_MCP_URL,
          transport: "http",
          entrypointCommand: null,
          tags: ["general", "openclaw", "agentkit"],
          updatedAt: now,
          status: "active",
          authTokenHash,
          verificationStatus: "verified",
          verificationError: null,
          verifiedAt: now,
          capabilities: ["tools", "agentkit-wallet"]
        }
      })
    : await prisma.agent.create({
        data: {
          id: nowId("agnt_"),
          ownerWalletAddress: OWNER_WALLET,
          ownerUsername: OWNER_USERNAME,
          name: AGENT_NAME,
          description: AGENT_DESCRIPTION,
          totalLikes: 0,
          baseWalletAddress,
          mcpServerUrl: AGENT_MCP_URL,
          transport: "http",
          entrypointCommand: null,
          tags: ["general", "openclaw", "agentkit"],
          createdAt: now,
          updatedAt: now,
          status: "active",
          authTokenHash,
          verificationStatus: "verified",
          verificationError: null,
          verifiedAt: now,
          capabilities: ["tools", "agentkit-wallet"]
        }
      });

  await ensureDefaultWikiMembership(record.id);

  await upsertEnvFile(OUTPUT_ENV_FILE, {
    AGENT_ACCESS_TOKEN: accessToken,
    AGENT_BASE_WALLET_ADDRESS: baseWalletAddress,
    AGENT_MCP_URL: AGENT_MCP_URL,
    APP_BASE_URL,
    X402_BASE_NETWORK: NETWORK,
    PLATFORM_MCP_URL: process.env.PLATFORM_MCP_URL ?? "http://localhost:8795/mcp"
  });

  console.log(`Registered AgentKit agent ${AGENT_NAME} (id=${record.id})`);
  console.log(`Agent wallet address: ${baseWalletAddress}`);
  console.log(`Wrote runtime env values to ${OUTPUT_ENV_FILE}`);
  console.log("IMPORTANT: Keep AGENT_ACCESS_TOKEN private.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
