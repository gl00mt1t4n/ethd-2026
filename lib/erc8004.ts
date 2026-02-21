import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  decodeEventLog,
  type Address,
  type Hash
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { hederaTestnet } from "./hederaChains";

const IDENTITY_REGISTRY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }]
  },
  {
    type: "function",
    name: "setAgentURI",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "newURI", type: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }]
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }]
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
] as const;

const REPUTATION_REGISTRY_ABI = [
  {
    type: "function",
    name: "giveFeedback",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "getSummary",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddresses", type: "address[]" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" }
    ],
    outputs: [
      { name: "count", type: "uint64" },
      { name: "summaryValue", type: "int128" },
      { name: "summaryValueDecimals", type: "uint8" }
    ]
  },
  {
    type: "function",
    name: "getClients",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address[]" }]
  },
  {
    type: "event",
    name: "NewFeedback",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "clientAddress", type: "address", indexed: true },
      { name: "feedbackIndex", type: "uint64", indexed: false },
      { name: "value", type: "int128", indexed: false },
      { name: "valueDecimals", type: "uint8", indexed: false },
      { name: "indexedTag1", type: "string", indexed: true },
      { name: "tag1", type: "string", indexed: false },
      { name: "tag2", type: "string", indexed: false },
      { name: "endpoint", type: "string", indexed: false },
      { name: "feedbackURI", type: "string", indexed: false },
      { name: "feedbackHash", type: "bytes32", indexed: false }
    ]
  }
] as const;

function getChain() {
  const chainId = Number(process.env.ERC8004_CHAIN_ID ?? "84532");
  if (chainId === 296) return hederaTestnet;
  if (chainId === 8453) return base;
  return baseSepolia;
}

export function getErc8004Config() {
  const chain = getChain();
  const identityRegistry = (process.env.ERC8004_IDENTITY_REGISTRY ?? "").trim() as Address;
  const reputationRegistry = (process.env.ERC8004_REPUTATION_REGISTRY ?? "").trim() as Address;

  return {
    chainId: chain.id,
    chain,
    identityRegistry,
    reputationRegistry,
    configured: Boolean(identityRegistry && reputationRegistry)
  };
}

function getRegistrarAccount() {
  const privateKey = (process.env.ERC8004_REGISTRAR_PRIVATE_KEY ?? "").trim() as `0x${string}`;
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("Missing or invalid ERC8004_REGISTRAR_PRIVATE_KEY");
  }
  return privateKeyToAccount(privateKey);
}

function getClients() {
  const chain = getChain();
  const rpcUrl = process.env.ERC8004_RPC_URL || process.env.HEDERA_TESTNET_RPC_URL;
  const transport = rpcUrl ? http(rpcUrl) : http();
  const publicClient = createPublicClient({ chain, transport });
  const account = getRegistrarAccount();
  const walletClient = createWalletClient({ account, chain, transport });
  return { publicClient, walletClient, account };
}

export type AgentRegistrationResult = {
  tokenId: number;
  txHash: Hash;
  chainId: number;
  identityRegistry: Address;
};

export async function registerAgent(agentURI: string): Promise<AgentRegistrationResult> {
  const config = getErc8004Config();
  if (!config.configured) {
    throw new Error("ERC-8004 not configured. Set ERC8004_IDENTITY_REGISTRY and ERC8004_REPUTATION_REGISTRY.");
  }

  const { publicClient, walletClient, account } = getClients();

  const data = encodeFunctionData({
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "register",
    args: [agentURI]
  });

  const txHash = await walletClient.sendTransaction({
    to: config.identityRegistry,
    data,
    account,
    chain: config.chain
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  let tokenId: number | null = null;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: IDENTITY_REGISTRY_ABI,
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

  if (tokenId === null) {
    throw new Error("Failed to extract tokenId from registration transaction");
  }

  return {
    tokenId,
    txHash,
    chainId: config.chainId,
    identityRegistry: config.identityRegistry
  };
}

export async function updateAgentURI(tokenId: number, newURI: string): Promise<{ txHash: Hash }> {
  const config = getErc8004Config();
  if (!config.configured) {
    throw new Error("ERC-8004 not configured");
  }

  const { publicClient, walletClient, account } = getClients();

  const data = encodeFunctionData({
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "setAgentURI",
    args: [BigInt(tokenId), newURI]
  });

  const txHash = await walletClient.sendTransaction({
    to: config.identityRegistry,
    data,
    account,
    chain: config.chain
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return { txHash };
}

export async function getAgentInfo(tokenId: number): Promise<{
  owner: Address;
  agentURI: string;
} | null> {
  const config = getErc8004Config();
  if (!config.configured) {
    return null;
  }

  const { publicClient } = getClients();

  try {
    const [owner, agentURI] = await Promise.all([
      publicClient.readContract({
        address: config.identityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "ownerOf",
        args: [BigInt(tokenId)]
      }),
      publicClient.readContract({
        address: config.identityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "tokenURI",
        args: [BigInt(tokenId)]
      })
    ]);

    return { owner, agentURI };
  } catch {
    return null;
  }
}

export type ReputationFeedbackInput = {
  agentTokenId: number;
  value: number;
  tag1: string;
  tag2?: string;
  endpoint?: string;
  feedbackURI?: string;
};

export async function submitReputationFeedback(
  input: ReputationFeedbackInput
): Promise<{ txHash: Hash }> {
  const config = getErc8004Config();
  if (!config.configured) {
    throw new Error("ERC-8004 not configured");
  }

  const { publicClient, walletClient, account } = getClients();

  const data = encodeFunctionData({
    abi: REPUTATION_REGISTRY_ABI,
    functionName: "giveFeedback",
    args: [
      BigInt(input.agentTokenId),
      BigInt(input.value),
      0,
      input.tag1,
      input.tag2 ?? "",
      input.endpoint ?? "",
      input.feedbackURI ?? "",
      "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`
    ]
  });

  const txHash = await walletClient.sendTransaction({
    to: config.reputationRegistry,
    data,
    account,
    chain: config.chain
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return { txHash };
}

export type ReputationSummary = {
  totalFeedbackCount: number;
  totalScore: number;
  averageScore: number;
};

export async function getReputationSummary(agentTokenId: number): Promise<ReputationSummary | null> {
  const config = getErc8004Config();
  if (!config.configured) {
    return null;
  }

  const { publicClient } = getClients();

  try {
    const clients = await publicClient.readContract({
      address: config.reputationRegistry,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "getClients",
      args: [BigInt(agentTokenId)]
    });

    if (clients.length === 0) {
      return {
        totalFeedbackCount: 0,
        totalScore: 0,
        averageScore: 0
      };
    }

    const [count, summaryValue] = await publicClient.readContract({
      address: config.reputationRegistry,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "getSummary",
      args: [BigInt(agentTokenId), clients as Address[], "", ""]
    });

    const feedbackCount = Number(count);
    const totalScore = Number(summaryValue);

    return {
      totalFeedbackCount: feedbackCount,
      totalScore,
      averageScore: feedbackCount > 0 ? totalScore / feedbackCount : 0
    };
  } catch {
    return null;
  }
}

export function buildAgentURI(input: {
  name: string;
  description: string;
  mcpServerUrl: string;
  baseWalletAddress?: string;
}): string {
  const metadata = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: input.name,
    description: input.description,
    services: [
      {
        name: "MCP",
        endpoint: input.mcpServerUrl,
        version: "2025-06-18"
      }
    ],
    active: true,
    supportedTrust: ["reputation"]
  };

  const json = JSON.stringify(metadata);
  const base64 = Buffer.from(json).toString("base64");
  return `data:application/json;base64,${base64}`;
}

export function getExplorerUrl(tokenId: number): string {
  const config = getErc8004Config();
  const baseUrl =
    config.chainId === 296
      ? "https://hashscan.io/testnet"
      : config.chainId === 8453
        ? "https://basescan.org"
        : "https://sepolia.basescan.org";
  return `${baseUrl}/token/${config.identityRegistry}?a=${tokenId}`;
}
