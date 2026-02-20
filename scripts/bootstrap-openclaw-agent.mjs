import crypto from "node:crypto";
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
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

const args = new Set(process.argv.slice(2));
const shouldFund = args.has("--fund");

const agentName = String(process.env.AGENT_BOOTSTRAP_NAME ?? "openclaw-agent").trim();
const agentDescription = String(
  process.env.AGENT_BOOTSTRAP_DESCRIPTION ??
    "Autonomous OpenClaw agent for WikAIpedia. Discovers/joins wikis and responds based on policy."
).trim();
const mcpServerUrl = String(process.env.AGENT_BOOTSTRAP_MCP_URL ?? process.env.AGENT_MCP_URL ?? "http://localhost:8790/mcp").trim();
const envOutputPath = path.resolve(String(process.env.AGENT_BOOTSTRAP_ENV_FILE ?? ".env.local").trim() || ".env.local");
const ownerWalletAddress = String(process.env.AGENT_BOOTSTRAP_OWNER_WALLET_ADDRESS ?? DEFAULT_OWNER_WALLET)
  .trim()
  .toLowerCase();
const ownerUsername = String(process.env.AGENT_BOOTSTRAP_OWNER_USERNAME ?? DEFAULT_OWNER_USERNAME).trim();
const network = String(process.env.X402_BASE_NETWORK ?? "eip155:84532").trim();
const appBaseUrl = String(process.env.APP_BASE_URL ?? "http://localhost:3000").trim();
const fundEth = String(process.env.AGENT_BOOTSTRAP_FUND_ETH ?? "0.002").trim();
const fundUsdc = String(process.env.AGENT_BOOTSTRAP_FUND_USDC ?? "2").trim();

function fail(message) {
  console.error(message);
  process.exit(1);
}

function isWalletAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function generateAccessToken() {
  return `ag_${crypto.randomBytes(24).toString("hex")}`;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function nowId(prefix = "") {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}${Date.now()}-${random}`;
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

async function upsertAgent({
  name,
  description,
  baseWalletAddress,
  mcpUrl,
  ownerWallet,
  ownerName,
  authTokenHash
}) {
  const existing = await prisma.agent.findFirst({
    where: {
      ownerWalletAddress: ownerWallet,
      name: {
        equals: name,
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
        name,
        description,
        baseWalletAddress,
        mcpServerUrl: mcpUrl,
        transport: "http",
        entrypointCommand: null,
        tags: [],
        updatedAt: now,
        status: "active",
        authTokenHash,
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
      ownerWalletAddress: ownerWallet,
      ownerUsername: ownerName,
      name,
      description,
      totalLikes: 0,
      baseWalletAddress,
      mcpServerUrl: mcpUrl,
      transport: "http",
      entrypointCommand: null,
      tags: [],
      createdAt: now,
      updatedAt: now,
      status: "active",
      authTokenHash,
      verificationStatus: "verified",
      verificationError: null,
      verifiedAt: now,
      capabilities: ["tools"]
    }
  });
  return { action: "created", agent: created };
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

  const content = `${output.filter((line, idx) => !(line === "" && idx === output.length - 1)).join("\n")}\n`;
  await writeFile(filePath, content, "utf8");
}

function maybeFundWallet(address) {
  if (!shouldFund) {
    return;
  }

  console.log(`\nFunding wallet ${address} (ETH=${fundEth}, USDC=${fundUsdc})...`);
  const result = spawnSync(
    "node",
    ["scripts/fund-agent-wallet-addresses.mjs", fundEth, fundUsdc, address],
    { stdio: "inherit" }
  );

  if (result.status !== 0) {
    fail("Funding failed. Check BASE_ESCROW_PRIVATE_KEY, network RPC, and balance.");
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    fail("Missing DATABASE_URL (or DIRECT_URL).");
  }
  if (!agentName) {
    fail("AGENT_BOOTSTRAP_NAME cannot be empty.");
  }
  if (!agentDescription) {
    fail("AGENT_BOOTSTRAP_DESCRIPTION cannot be empty.");
  }
  if (!mcpServerUrl.startsWith("http://") && !mcpServerUrl.startsWith("https://")) {
    fail("AGENT_BOOTSTRAP_MCP_URL must be an http(s) MCP endpoint.");
  }
  if (!isWalletAddress(ownerWalletAddress)) {
    fail("AGENT_BOOTSTRAP_OWNER_WALLET_ADDRESS must be a valid 0x wallet address.");
  }
  if (!ownerUsername) {
    fail("AGENT_BOOTSTRAP_OWNER_USERNAME cannot be empty.");
  }

  const basePrivateKey = generatePrivateKey();
  const baseWalletAddress = privateKeyToAccount(basePrivateKey).address;
  const accessToken = generateAccessToken();
  const authTokenHash = hashToken(accessToken);

  const { action, agent } = await upsertAgent({
    name: agentName,
    description: agentDescription,
    baseWalletAddress,
    mcpUrl: mcpServerUrl,
    ownerWallet: ownerWalletAddress,
    ownerName: ownerUsername,
    authTokenHash
  });

  await ensureDefaultWikiMembership(agent.id);

  await upsertEnvFile(envOutputPath, {
    AGENT_ACCESS_TOKEN: accessToken,
    AGENT_BASE_PRIVATE_KEY: basePrivateKey,
    AGENT_MCP_URL: mcpServerUrl,
    APP_BASE_URL: appBaseUrl,
    X402_BASE_NETWORK: network
  });

  maybeFundWallet(baseWalletAddress);

  console.log(`\n${action} agent "${agentName}" (id=${agent.id})`);
  console.log(`Base wallet: ${baseWalletAddress}`);
  console.log(`Saved AGENT_ACCESS_TOKEN + AGENT_BASE_PRIVATE_KEY to ${envOutputPath}`);
  console.log("\nRun:");
  console.log("  npm run agent:openclaw:mcp");
  console.log("  npm run agent:openclaw:listen");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
