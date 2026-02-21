import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  formatUnits,
  http,
  parseEther,
  parseUnits
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { loadLocalEnv } from "./load-local-env.mjs";

loadLocalEnv();

const CONFIG_PATH = path.resolve(
  String(process.env.OPENCLAW_SWARM_CONFIG ?? "test/openclaw-agents.local.json").trim()
);
const TARGET_ETH = Number(process.argv[2] ?? process.env.OPENCLAW_SWARM_TARGET_ETH ?? 0.05);
const TARGET_USDC = Number(process.argv[3] ?? process.env.OPENCLAW_SWARM_TARGET_USDC ?? 50);
const NETWORK = (process.env.X402_BASE_NETWORK ?? "eip155:84532").trim();
const ESCROW_PRIVATE_KEY = (process.env.BASE_ESCROW_PRIVATE_KEY ?? "").trim();

const USDC_ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  }
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function getChain() {
  return NETWORK === "eip155:8453" ? base : baseSepolia;
}

function getUsdcAddress(chain) {
  if (chain.id === baseSepolia.id) {
    return "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  }
  return "0x833589fCD6EDb6E08f4c7C32D4f71b54bdA02913";
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isNonceTooLowError(error) {
  const text = error instanceof Error ? error.message : String(error);
  return text.toLowerCase().includes("nonce too low");
}

async function loadAddresses() {
  let raw = "";
  try {
    raw = await readFile(CONFIG_PATH, "utf8");
  } catch (error) {
    fail(`Could not read config: ${CONFIG_PATH}\n${error instanceof Error ? error.message : String(error)}`);
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`Invalid JSON in ${CONFIG_PATH}\n${error instanceof Error ? error.message : String(error)}`);
  }

  const agents = Array.isArray(parsed?.agents) ? parsed.agents : [];
  const addresses = [
    ...new Set(
      agents
        .map((agent) => String(agent?.baseWalletAddress ?? "").trim().toLowerCase())
        .filter(Boolean)
    )
  ];

  if (!addresses.length) {
    fail(`No wallet addresses found in ${CONFIG_PATH}`);
  }

  for (const address of addresses) {
    if (!isAddress(address)) {
      fail(`Invalid wallet address in config: ${address}`);
    }
  }

  return addresses;
}

async function main() {
  if (!ESCROW_PRIVATE_KEY) {
    fail("Missing BASE_ESCROW_PRIVATE_KEY.");
  }
  if (!Number.isFinite(TARGET_ETH) || TARGET_ETH < 0) {
    fail("TARGET_ETH must be a non-negative number.");
  }
  if (!Number.isFinite(TARGET_USDC) || TARGET_USDC < 0) {
    fail("TARGET_USDC must be a non-negative number.");
  }

  const addresses = await loadAddresses();
  const chain = getChain();
  const usdcAddress = getUsdcAddress(chain);
  const escrow = privateKeyToAccount(ESCROW_PRIVATE_KEY);
  const publicClient = createPublicClient({ chain, transport: http() });
  const walletClient = createWalletClient({ account: escrow, chain, transport: http() });
  let nextNonce = await publicClient.getTransactionCount({
    address: escrow.address,
    blockTag: "pending"
  });

  async function sendTxWithManagedNonce(txRequest) {
    while (true) {
      try {
        const hash = await walletClient.sendTransaction({
          ...txRequest,
          account: escrow,
          chain,
          nonce: nextNonce
        });
        nextNonce += 1;
        return hash;
      } catch (error) {
        if (!isNonceTooLowError(error)) {
          throw error;
        }
        nextNonce = await publicClient.getTransactionCount({
          address: escrow.address,
          blockTag: "pending"
        });
      }
    }
  }

  const targetEthWei = parseEther(TARGET_ETH.toString());
  const targetUsdc = parseUnits(TARGET_USDC.toFixed(6), 6);
  const [escrowEthBalance, escrowUsdcBalance] = await Promise.all([
    publicClient.getBalance({ address: escrow.address }),
    publicClient.readContract({
      address: usdcAddress,
      abi: USDC_ERC20_ABI,
      functionName: "balanceOf",
      args: [escrow.address]
    })
  ]);

  console.log(`Network: ${NETWORK}`);
  console.log(`Escrow: ${escrow.address}`);
  console.log(`Top-up targets per wallet: ${TARGET_ETH} ETH, ${TARGET_USDC} USDC`);
  console.log(`Wallet count: ${addresses.length}`);
  console.log(`Escrow balances: ${formatEther(escrowEthBalance)} ETH, ${formatUnits(escrowUsdcBalance, 6)} USDC`);

  const topupPlans = [];
  let totalEthNeeded = 0n;
  let totalUsdcNeeded = 0n;

  for (const address of addresses) {
    const [ethBalance, usdcBalance] = await Promise.all([
      publicClient.getBalance({ address }),
      publicClient.readContract({
        address: usdcAddress,
        abi: USDC_ERC20_ABI,
        functionName: "balanceOf",
        args: [address]
      })
    ]);

    const ethNeeded = ethBalance < targetEthWei ? targetEthWei - ethBalance : 0n;
    const usdcNeeded = usdcBalance < targetUsdc ? targetUsdc - usdcBalance : 0n;

    topupPlans.push({
      address,
      ethBalance,
      usdcBalance,
      ethNeeded,
      usdcNeeded
    });
    totalEthNeeded += ethNeeded;
    totalUsdcNeeded += usdcNeeded;
  }

  const ethShortfall = totalEthNeeded > escrowEthBalance ? totalEthNeeded - escrowEthBalance : 0n;
  const usdcShortfall = totalUsdcNeeded > escrowUsdcBalance ? totalUsdcNeeded - escrowUsdcBalance : 0n;
  if (ethShortfall > 0n || usdcShortfall > 0n) {
    fail(
      [
        "Escrow balance is insufficient for requested top-up target.",
        `Required total: ${formatEther(totalEthNeeded)} ETH, ${formatUnits(totalUsdcNeeded, 6)} USDC`,
        `Available: ${formatEther(escrowEthBalance)} ETH, ${formatUnits(escrowUsdcBalance, 6)} USDC`,
        `Shortfall: ${formatEther(ethShortfall)} ETH, ${formatUnits(usdcShortfall, 6)} USDC`,
        "Lower target amounts or refill the escrow wallet/faucet first."
      ].join("\n")
    );
  }

  for (const plan of topupPlans) {
    const { address, ethBalance, usdcBalance, ethNeeded, usdcNeeded } = plan;

    console.log(
      `\n${address}\n  current: ${formatEther(ethBalance)} ETH, ${formatUnits(usdcBalance, 6)} USDC\n  needed: ${formatEther(ethNeeded)} ETH, ${formatUnits(usdcNeeded, 6)} USDC`
    );

    if (usdcNeeded > 0n) {
      const transferData = encodeFunctionData({
        abi: USDC_ERC20_ABI,
        functionName: "transfer",
        args: [address, usdcNeeded]
      });
      const usdcHash = await sendTxWithManagedNonce({
        to: usdcAddress,
        data: transferData
      });
      await publicClient.waitForTransactionReceipt({ hash: usdcHash });
      console.log(`  USDC top-up tx: ${usdcHash}`);
    }

    if (ethNeeded > 0n) {
      const ethHash = await sendTxWithManagedNonce({
        to: address,
        value: ethNeeded
      });
      await publicClient.waitForTransactionReceipt({ hash: ethHash });
      console.log(`  ETH top-up tx: ${ethHash}`);
    }
  }

  console.log("\nTop-up complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
