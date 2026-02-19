import { readFile } from "node:fs/promises";
import path from "node:path";
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

const CONFIG_PATH = path.resolve("test/fixed-agents.local.json");
const NETWORK = "eip155:84532";
const ESCROW_PRIVATE_KEY = (process.env.BASE_ESCROW_PRIVATE_KEY ?? "").trim();
const USDC_PER_AGENT = process.argv[2] ? Number(process.argv[2]) : 2;
const ETH_PER_AGENT = process.argv[3] ? Number(process.argv[3]) : 0.002;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function getChain() {
  if (NETWORK === "eip155:84532") {
    return baseSepolia;
  }
  return base;
}

function getUsdcAddress() {
  const chain = getChain();
  if (chain.id === baseSepolia.id) {
    return "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  }
  return "0x833589fCD6EDb6E08f4c7C32D4f71b54bdA02913";
}

async function readAgentAddresses() {
  let raw;
  try {
    raw = await readFile(CONFIG_PATH, "utf8");
  } catch (error) {
    fail(`Could not read config: ${CONFIG_PATH}\n${error instanceof Error ? error.message : String(error)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`Config is not valid JSON: ${CONFIG_PATH}\n${error instanceof Error ? error.message : String(error)}`);
  }

  const agents = Array.isArray(parsed?.agents) ? parsed.agents : [];
  if (!agents.length) {
    fail(`Config has no agents: ${CONFIG_PATH}`);
  }

  const addresses = [];
  for (const agent of agents) {
    const name = String(agent?.name ?? "agent").trim() || "agent";
    const pk = String(agent?.basePrivateKey ?? "").trim();
    if (!pk) {
      fail(`Missing basePrivateKey for agent "${name}"`);
    }
    const account = privateKeyToAccount(pk);
    addresses.push({ name, address: account.address });
  }
  return addresses;
}

async function main() {
  if (!ESCROW_PRIVATE_KEY) {
    fail("BASE_ESCROW_PRIVATE_KEY is required.");
  }
  if (!Number.isFinite(USDC_PER_AGENT) || USDC_PER_AGENT < 0) {
    fail("USDC amount must be >= 0");
  }
  if (!Number.isFinite(ETH_PER_AGENT) || ETH_PER_AGENT < 0) {
    fail("ETH amount must be >= 0");
  }

  const chain = getChain();
  const usdcAddress = getUsdcAddress();
  const escrow = privateKeyToAccount(ESCROW_PRIVATE_KEY);
  const publicClient = createPublicClient({ chain, transport: http() });
  const walletClient = createWalletClient({ account: escrow, chain, transport: http() });
  const agents = await readAgentAddresses();

  console.log(`Network: ${NETWORK}`);
  console.log(`Escrow: ${escrow.address}`);
  console.log(`Agents: ${agents.length}`);
  console.log(`Top-up per agent: ${USDC_PER_AGENT} USDC and ${ETH_PER_AGENT} ETH`);

  for (const agent of agents) {
    console.log(`\nFunding ${agent.name} (${agent.address})`);

    if (USDC_PER_AGENT > 0) {
      const usdcAmount = parseUnits(USDC_PER_AGENT.toFixed(6), 6);
      const transferData = encodeFunctionData({
        abi: USDC_ERC20_ABI,
        functionName: "transfer",
        args: [agent.address, usdcAmount]
      });
      const usdcHash = await walletClient.sendTransaction({
        account: escrow,
        chain,
        to: usdcAddress,
        data: transferData
      });
      await publicClient.waitForTransactionReceipt({ hash: usdcHash });
      console.log(`  USDC tx: ${usdcHash}`);
    }

    if (ETH_PER_AGENT > 0) {
      const ethHash = await walletClient.sendTransaction({
        account: escrow,
        chain,
        to: agent.address,
        value: parseEther(ETH_PER_AGENT.toString())
      });
      await publicClient.waitForTransactionReceipt({ hash: ethHash });
      console.log(`  ETH tx: ${ethHash}`);
    }

    const [ethBalance, usdcBalance] = await Promise.all([
      publicClient.getBalance({ address: agent.address }),
      publicClient.readContract({
        address: usdcAddress,
        abi: USDC_ERC20_ABI,
        functionName: "balanceOf",
        args: [agent.address]
      })
    ]);
    console.log(`  New balances: ${formatEther(ethBalance)} ETH, ${formatUnits(usdcBalance, 6)} USDC`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
