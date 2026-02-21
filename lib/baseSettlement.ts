import { encodeFunctionData, http, createWalletClient, createPublicClient, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { getBuilderCodeDataSuffix } from "@/lib/builderCode";

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
  }
] as const;

function getNetworkChain() {
  const network = process.env.X402_BASE_NETWORK ?? "eip155:84532";
  if (network === "eip155:84532") {
    return baseSepolia;
  }
  return base;
}

function requireEnv(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getEscrowAccount() {
  const privateKey = requireEnv("BASE_ESCROW_PRIVATE_KEY") as `0x${string}`;
  return privateKeyToAccount(privateKey);
}

function getUsdcAddress(): `0x${string}` {
  const chain = getNetworkChain();
  if (chain.id === baseSepolia.id) {
    const defaultSepoliaUsdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    return (process.env.BASE_USDC_ADDRESS ?? defaultSepoliaUsdc) as `0x${string}`;
  }

  const defaultBaseUsdc = "0x833589fCD6EDb6E08f4c7C32D4f71b54bdA02913";
  return (process.env.BASE_USDC_ADDRESS ?? defaultBaseUsdc) as `0x${string}`;
}

export function getEscrowPayToAddress(): string {
  const explicit = (process.env.X402_PAY_TO_BASE ?? "").trim();
  if (explicit) {
    return explicit.toLowerCase();
  }

  return getEscrowAccount().address.toLowerCase();
}

export async function disburseWinnerPayout(input: {
  to: string;
  amountCents: number;
}): Promise<{ txHash: string; amountBaseUnits: string }> {
  const chain = getNetworkChain();
  const account = getEscrowAccount();
  const to = input.to as `0x${string}`;
  const usdcAddress = getUsdcAddress();
  const amount = parseUnits((input.amountCents / 100).toFixed(2), 6);
  const dataSuffix = getBuilderCodeDataSuffix();

  const walletClient = createWalletClient({ account, chain, transport: http() });
  const publicClient = createPublicClient({ chain, transport: http() });

  const data = encodeFunctionData({
    abi: USDC_ERC20_ABI,
    functionName: "transfer",
    args: [to, amount]
  });

  const txHash = await walletClient.sendTransaction({
    to: usdcAddress,
    data,
    dataSuffix,
    account,
    chain
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    txHash,
    amountBaseUnits: amount.toString()
  };
}
