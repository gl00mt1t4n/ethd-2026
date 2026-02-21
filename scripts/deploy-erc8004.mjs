#!/usr/bin/env node

/**
 * Deploy ERC-8004 Identity and Reputation Registry contracts
 * Supports Base Sepolia and Hedera Testnet (use DEPLOY_TARGET=hedera for Hedera)
 */

import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { defineChain } from "viem";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import solc from "solc";

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
const DEPLOY_TARGET = (process.env.DEPLOY_TARGET || "base").toLowerCase();

if (!DEPLOYER_KEY) {
  console.error("Error: Set DEPLOYER_PRIVATE_KEY or ERC8004_REGISTRAR_PRIVATE_KEY in .env");
  process.exit(1);
}

function normalizeRpcUrl(url) {
  if (!url) return "https://testnet.hashio.io/api";
  const u = url.trim();
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return `https://${u}`;
}

const hederaRpcUrl = normalizeRpcUrl(process.env.HEDERA_TESTNET_RPC_URL);

const hederaTestnet = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: {
    default: {
      http: [hederaRpcUrl]
    }
  },
  blockExplorers: {
    default: { name: "HashScan", url: "https://hashscan.io/testnet" }
  }
});

// Base Sepolia: Identity already deployed
const BASE_IDENTITY_REGISTRY = "0xea81e945454f3ce357516f35a9bb69c7dd11b43a";

function compileContract(contractName) {
  const contractPath = path.join(ROOT, "contracts", `${contractName}.sol`);
  const source = readFileSync(contractPath, "utf8");

  const input = {
    language: "Solidity",
    sources: {
      [`${contractName}.sol`]: { content: source }
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"]
        }
      }
    }
  };

  console.log(`Compiling ${contractName}...`);

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors?.some((e) => e.severity === "error")) {
    console.error("Compilation errors:");
    for (const err of output.errors) {
      if (err.severity === "error") console.error(err.formattedMessage);
    }
    process.exit(1);
  }

  const contract = output.contracts[`${contractName}.sol`][contractName];
  console.log(`Compiled successfully!`);
  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`
  };
}

async function deploy() {
  const account = privateKeyToAccount(DEPLOYER_KEY);
  const isHedera = DEPLOY_TARGET === "hedera";

  const chain = isHedera ? hederaTestnet : baseSepolia;
  const rpcUrl = isHedera ? hederaRpcUrl : undefined;
  const transport = rpcUrl ? http(rpcUrl) : http();

  console.log(`Deployer address: ${account.address}`);
  console.log(`Chain: ${chain.name} (${chain.id})`);
  console.log("");

  const publicClient = createPublicClient({
    chain,
    transport
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport
  });

  const balance = await publicClient.getBalance({ address: account.address });
  const decimals = chain.nativeCurrency.decimals ?? 18;
  const symbol = chain.nativeCurrency.symbol ?? "ETH";
  console.log(`Balance: ${(Number(balance) / 10 ** decimals).toFixed(4)} ${symbol}`);
  console.log("");

  let identityAddress;
  let identityTxHash;

  if (isHedera) {
    // Deploy both contracts to Hedera
    console.log("=== Deploying AgentIdentityRegistry ===");
    const identity = compileContract("AgentIdentityRegistry");

    identityTxHash = await walletClient.deployContract({
      abi: identity.abi,
      bytecode: identity.bytecode,
      account
    });
    console.log(`Transaction: ${identityTxHash}`);
    console.log("Waiting for confirmation...");

    const identityReceipt = await publicClient.waitForTransactionReceipt({ hash: identityTxHash });
    identityAddress = identityReceipt.contractAddress;
    console.log(`Identity Registry deployed: ${identityAddress}`);
    console.log("");
  } else {
    identityAddress = BASE_IDENTITY_REGISTRY;
    identityTxHash = "0xc440bfb76749703e0762550b2c5a99942a14ccc63b2a0b696cb64253d4149122";
    console.log(`Identity Registry (already deployed): ${identityAddress}`);
    console.log("");
  }

  // Deploy Reputation Registry
  console.log("=== Deploying AgentReputationRegistry ===");
  const reputation = compileContract("AgentReputationRegistry");

  const reputationHash = await walletClient.deployContract({
    abi: reputation.abi,
    bytecode: reputation.bytecode,
    account
  });
  console.log(`Transaction: ${reputationHash}`);
  console.log("Waiting for confirmation...");

  const reputationReceipt = await publicClient.waitForTransactionReceipt({ hash: reputationHash });
  const reputationAddress = reputationReceipt.contractAddress;
  console.log(`Reputation Registry deployed: ${reputationAddress}`);
  console.log("");

  const chainId = chain.id;
  const chainName = chain.name;

  console.log("===========================================");
  console.log("Deployment complete! Add to your .env file:");
  console.log("===========================================");
  console.log("");
  console.log(`ERC8004_CHAIN_ID=${chainId}`);
  console.log(`ERC8004_IDENTITY_REGISTRY=${identityAddress}`);
  console.log(`ERC8004_REPUTATION_REGISTRY=${reputationAddress}`);
  if (isHedera) {
    console.log(`HEDERA_TESTNET_RPC_URL=${process.env.HEDERA_TESTNET_RPC_URL || "https://testnet.hashio.io/api"}`);
  }
  console.log(`ERC8004_REGISTRAR_PRIVATE_KEY=${DEPLOYER_KEY}`);
  console.log("");

  const deploymentInfo = {
    chainId,
    chainName,
    deployedAt: new Date().toISOString(),
    deployer: account.address,
    contracts: {
      identityRegistry: {
        address: identityAddress,
        txHash: identityTxHash
      },
      reputationRegistry: {
        address: reputationAddress,
        txHash: reputationHash
      }
    }
  };

  writeFileSync(
    path.join(ROOT, "erc8004-deployment.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("Deployment info saved to: erc8004-deployment.json");
}

deploy().catch((err) => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
