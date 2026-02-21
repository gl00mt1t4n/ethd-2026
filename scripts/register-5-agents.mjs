#!/usr/bin/env node

/**
 * Register 5 agent token IDs on the ERC-8004 Identity Registry
 */

import { createWalletClient, createPublicClient, http, encodeFunctionData, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Load .env
try {
  const envPath = path.join(ROOT, ".env");
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, "");
      }
    }
  }
} catch (e) {
  console.error("Warning: Could not load .env file");
}

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY || process.env.ERC8004_REGISTRAR_PRIVATE_KEY;
const IDENTITY_REGISTRY = process.env.ERC8004_IDENTITY_REGISTRY;

if (!DEPLOYER_KEY || !IDENTITY_REGISTRY) {
  console.error("Error: Set ERC8004_REGISTRAR_PRIVATE_KEY and ERC8004_IDENTITY_REGISTRY in .env");
  process.exit(1);
}

const IDENTITY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }]
  },
  {
    type: "event",
    name: "Registered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true }
    ]
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true }
    ]
  }
];

function buildAgentURI(name, description) {
  const metadata = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name,
    description,
    active: true
  };
  const json = JSON.stringify(metadata);
  const base64 = Buffer.from(json).toString("base64");
  return `data:application/json;base64,${base64}`;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const account = privateKeyToAccount(DEPLOYER_KEY);
  console.log(`Registrar: ${account.address}`);
  console.log(`Identity Registry: ${IDENTITY_REGISTRY}`);
  console.log("");

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http()
  });

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http()
  });

  // Start from agent 2 since agent 1 is already registered
  const agents = [
    { name: "Agent Beta", description: "Second reusable agent slot" },
    { name: "Agent Gamma", description: "Third reusable agent slot" },
    { name: "Agent Delta", description: "Fourth reusable agent slot" },
    { name: "Agent Epsilon", description: "Fifth reusable agent slot" }
  ];

  console.log("Token ID 1 already registered (Agent Alpha)");
  console.log("");

  const tokenIds = [1]; // Already have token ID 1

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    console.log(`Registering ${agent.name}...`);

    const agentURI = buildAgentURI(agent.name, agent.description);

    try {
      const data = encodeFunctionData({
        abi: IDENTITY_ABI,
        functionName: "register",
        args: [agentURI]
      });

      // Get current nonce
      const nonce = await publicClient.getTransactionCount({ address: account.address });

      const txHash = await walletClient.sendTransaction({
        to: IDENTITY_REGISTRY,
        data,
        account,
        chain: baseSepolia,
        nonce
      });

      console.log(`  TX: ${txHash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      // Extract token ID from logs
      let tokenId = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: IDENTITY_ABI,
            data: log.data,
            topics: log.topics
          });
          if (decoded.eventName === "Registered") {
            tokenId = Number(decoded.args.agentId);
            break;
          }
          if (decoded.eventName === "Transfer" && decoded.args.from === "0x0000000000000000000000000000000000000000") {
            tokenId = Number(decoded.args.tokenId);
          }
        } catch {
          continue;
        }
      }

      if (tokenId) {
        console.log(`  ✓ Token ID: ${tokenId}`);
        tokenIds.push(tokenId);
      } else {
        console.log(`  ✗ Could not extract token ID`);
      }
    } catch (err) {
      console.log(`  ✗ Error: ${err.message}`);
    }

    console.log("");
    
    // Wait a bit between transactions
    if (i < agents.length - 1) {
      await sleep(2000);
    }
  }

  console.log("===========================================");
  console.log("Registration complete!");
  console.log("===========================================");
  console.log("");
  console.log("Token IDs you can reuse:");
  tokenIds.forEach((id, i) => {
    console.log(`  Agent ${i + 1}: Token ID ${id}`);
  });
  console.log("");
  console.log("To assign a token ID to an agent in your database:");
  console.log("  UPDATE \"Agent\" SET");
  console.log("    \"erc8004TokenId\" = <TOKEN_ID>,");
  console.log("    \"erc8004ChainId\" = 84532,");
  console.log(`    "erc8004IdentityRegistry" = '${IDENTITY_REGISTRY}'`);
  console.log("  WHERE id = '<AGENT_ID>';");
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
