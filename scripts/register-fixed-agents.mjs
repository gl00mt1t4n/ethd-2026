import crypto from "node:crypto";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { privateKeyToAccount } from "viem/accounts";
import { loadLocalEnv } from "./load-local-env.mjs";

loadLocalEnv();

if ((process.env.DIRECT_URL ?? "").trim()) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const prisma = new PrismaClient();

const CONFIG_PATH = path.resolve("test/fixed-agents.local.json");
const OWNER_WALLET_ADDRESS = "0x1111111111111111111111111111111111111111";
const OWNER_USERNAME = "local_test_owner";

function generateAccessToken() {
  return `ag_${crypto.randomBytes(24).toString("hex")}`;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizePort(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function normalizeString(value, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function requiresNewToken(token) {
  const normalized = normalizeString(token);
  return !normalized || normalized.startsWith("ag_replace_me_");
}

function defaultFixedResponse(index) {
  return `Agent ${index + 1}: fixed test response for this question.`;
}

async function readConfig() {
  const raw = await readFile(CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw);
  const agents = Array.isArray(parsed?.agents) ? parsed.agents : [];
  if (!agents.length) {
    throw new Error(`No agents found in ${CONFIG_PATH}`);
  }
  return { parsed, agents };
}

async function upsertAgent(input) {
  const existing = await prisma.agent.findFirst({
    where: {
      ownerWalletAddress: OWNER_WALLET_ADDRESS,
      name: {
        equals: input.name,
        mode: "insensitive"
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  if (existing) {
    await prisma.agent.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        description: input.description,
        baseWalletAddress: input.baseWalletAddress,
        mcpServerUrl: input.mcpServerUrl,
        transport: "http",
        entrypointCommand: null,
        tags: [],
        updatedAt: new Date(),
        status: "active",
        authTokenHash: input.authTokenHash,
        verificationStatus: "verified",
        verificationError: null,
        verifiedAt: new Date(),
        capabilities: ["tools"]
      }
    });
    return { action: "updated", id: existing.id };
  }

  const now = new Date();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  await prisma.agent.create({
    data: {
      id,
      ownerWalletAddress: OWNER_WALLET_ADDRESS,
      ownerUsername: OWNER_USERNAME,
      name: input.name,
      description: input.description,
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
  return { action: "created", id };
}

async function main() {
  const { agents } = await readConfig();
  const outputAgents = [];

  for (let i = 0; i < agents.length; i += 1) {
    const source = agents[i] ?? {};
    const name = normalizeString(source.name, `agent-${i + 1}`);
    const mcpPort = normalizePort(source.mcpPort, 8801 + i);
    const fixedResponse = normalizeString(source.fixedResponse, defaultFixedResponse(i));
    const description = normalizeString(
      source.description,
      `Fixed-response local test agent (${name}) for Base Sepolia x402 flow.`
    );
    const mnemonic = normalizeString(source.mnemonic);
    const basePrivateKey = normalizeString(source.basePrivateKey);
    if (!basePrivateKey) {
      throw new Error(`Missing basePrivateKey for ${name}`);
    }

    const account = privateKeyToAccount(basePrivateKey);
    const baseWalletAddress = account.address;
    const mcpServerUrl = `http://localhost:${mcpPort}/mcp`;

    const token = requiresNewToken(source.accessToken) ? generateAccessToken() : normalizeString(source.accessToken);
    const authTokenHash = hashToken(token);

    const result = await upsertAgent({
      name,
      description,
      baseWalletAddress,
      mcpServerUrl,
      authTokenHash
    });

    console.log(`${result.action} ${name} (${baseWalletAddress}) id=${result.id}`);

    outputAgents.push({
      ...source,
      name,
      accessToken: token,
      mnemonic,
      basePrivateKey,
      baseWalletAddress,
      mcpPort,
      fixedResponse,
      description
    });
  }

  await writeFile(CONFIG_PATH, `${JSON.stringify({ agents: outputAgents }, null, 2)}\n`, "utf8");
  console.log(`\nSynced ${outputAgents.length} agent(s) and wrote tokens to ${CONFIG_PATH}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
