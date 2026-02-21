#!/usr/bin/env node

/**
 * Migration script to register existing agents with ERC-8004.
 * 
 * Usage:
 *   npm run agent:migrate:erc8004
 *   node scripts/migrate-agents-erc8004.mjs
 * 
 * This script will:
 * 1. Find all agents without ERC-8004 registration
 * 2. Register each agent on-chain
 * 3. Update the database with the token ID
 */

import { PrismaClient } from "@prisma/client";

// Load environment
const envPath = new URL("../.env", import.meta.url);
try {
  const { config } = await import("dotenv");
  config({ path: envPath });
} catch {
  // dotenv not available, rely on process.env
}

if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const prisma = new PrismaClient();

async function main() {
  // Dynamic import of ERC-8004 module
  let erc8004;
  try {
    erc8004 = await import("../lib/erc8004.ts");
  } catch (err) {
    console.error("Failed to import ERC-8004 module:", err.message);
    console.error("Run with: npx tsx scripts/migrate-agents-erc8004.mjs");
    process.exit(1);
  }

  const config = erc8004.getErc8004Config();
  if (!config.configured) {
    console.error("ERC-8004 not configured. Set environment variables:");
    console.error("  ERC8004_IDENTITY_REGISTRY");
    console.error("  ERC8004_REPUTATION_REGISTRY");
    console.error("  ERC8004_REGISTRAR_PRIVATE_KEY");
    process.exit(1);
  }

  console.log(`ERC-8004 Configuration:`);
  console.log(`  Chain ID: ${config.chainId}`);
  console.log(`  Identity Registry: ${config.identityRegistry}`);
  console.log();

  // Find agents without ERC-8004 registration
  const agents = await prisma.agent.findMany({
    where: {
      erc8004TokenId: null
    },
    select: {
      id: true,
      name: true,
      description: true,
      mcpServerUrl: true,
      baseWalletAddress: true
    }
  });

  if (agents.length === 0) {
    console.log("All agents already have ERC-8004 registration.");
    return;
  }

  console.log(`Found ${agents.length} agent(s) without ERC-8004 registration.`);
  console.log();

  let migrated = 0;
  let failed = 0;

  for (const agent of agents) {
    console.log(`Registering ${agent.name} (${agent.id})...`);

    try {
      const agentURI = erc8004.buildAgentURI({
        name: agent.name,
        description: agent.description,
        mcpServerUrl: agent.mcpServerUrl,
        baseWalletAddress: agent.baseWalletAddress
      });

      const result = await erc8004.registerAgent(agentURI);

      await prisma.agent.update({
        where: { id: agent.id },
        data: {
          erc8004ChainId: result.chainId,
          erc8004TokenId: result.tokenId,
          erc8004IdentityRegistry: result.identityRegistry,
          erc8004RegisteredAt: new Date(),
          erc8004TxHash: result.txHash
        }
      });

      console.log(`  ✓ Registered with tokenId=${result.tokenId}`);
      console.log(`    TX: ${result.txHash}`);
      migrated++;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ Failed: ${errorMessage}`);
      failed++;
    }

    console.log();
  }

  console.log(`Summary:`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${agents.length}`);
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
