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

const NETWORK = (process.env.X402_BASE_NETWORK ?? "eip155:84532").trim();
const ESCROW_PRIVATE_KEY = (process.env.BASE_ESCROW_PRIVATE_KEY ?? "").trim();
const ETH_PER_WALLET = process.argv[2] ? Number(process.argv[2]) : 0.005;
const USDC_PER_WALLET = process.argv[3] ? Number(process.argv[3]) : 2;
const RAW_ADDRESSES = process.argv.slice(4).map((value) => String(value).trim()).filter(Boolean);

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

async function main() {
  if (!ESCROW_PRIVATE_KEY) {
    fail("Missing BASE_ESCROW_PRIVATE_KEY.");
  }
  if (!Number.isFinite(ETH_PER_WALLET) || ETH_PER_WALLET < 0) {
    fail("ETH amount must be >= 0.");
  }
  if (!Number.isFinite(USDC_PER_WALLET) || USDC_PER_WALLET < 0) {
    fail("USDC amount must be >= 0.");
  }
  if (RAW_ADDRESSES.length === 0) {
    fail("Provide at least one wallet address.\nUsage: npm run agent:fund:wallets -- <eth> <usdc> <addr1> <addr2> ...");
  }

  const addresses = [...new Set(RAW_ADDRESSES.map((value) => value.toLowerCase()))];
  for (const address of addresses) {
    if (!isAddress(address)) {
      fail(`Invalid wallet address: ${address}`);
    }
  }

  const chain = getChain();
  if (chain.id !== baseSepolia.id) {
    console.warn("Warning: current network is not Base Sepolia.");
  }
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

  console.log(`Network: ${NETWORK}`);
  console.log(`Escrow: ${escrow.address}`);
  console.log(`Funding ${addresses.length} wallet(s) with ${ETH_PER_WALLET} ETH and ${USDC_PER_WALLET} USDC each.`);

  for (const address of addresses) {
    console.log(`\nFunding ${address}`);

    if (USDC_PER_WALLET > 0) {
      const usdcAmount = parseUnits(USDC_PER_WALLET.toFixed(6), 6);
      const transferData = encodeFunctionData({
        abi: USDC_ERC20_ABI,
        functionName: "transfer",
        args: [address, usdcAmount]
      });
      const usdcHash = await sendTxWithManagedNonce({
        to: usdcAddress,
        data: transferData
      });
      await publicClient.waitForTransactionReceipt({ hash: usdcHash });
      console.log(`  USDC tx: ${usdcHash}`);
    }

    if (ETH_PER_WALLET > 0) {
      const ethHash = await sendTxWithManagedNonce({
        to: address,
        value: parseEther(ETH_PER_WALLET.toString())
      });
      await publicClient.waitForTransactionReceipt({ hash: ethHash });
      console.log(`  ETH tx: ${ethHash}`);
    }

    const [ethBalance, usdcBalance] = await Promise.all([
      publicClient.getBalance({ address }),
      publicClient.readContract({
        address: usdcAddress,
        abi: USDC_ERC20_ABI,
        functionName: "balanceOf",
        args: [address]
      })
    ]);

    console.log(`  New balances: ${formatEther(ethBalance)} ETH, ${formatUnits(usdcBalance, 6)} USDC`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
