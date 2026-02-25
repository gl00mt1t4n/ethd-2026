import { createPublicClient, custom } from "viem";
import type { Chain, EIP1193Provider, Hex, TransactionReceipt } from "viem";
import { normalizeEvmAddress } from "@/lib/evmAddress";

export type Eip1193ProviderLike = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
};

export { normalizeEvmAddress, normalizeEvmAddress as normalizeAddress };

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }]
  }
] as const;

export function toHexQuantity(value: unknown): Hex | undefined {
  if (value == null) return undefined;
  if (typeof value === "bigint") return `0x${value.toString(16)}`;
  if (typeof value === "number") return `0x${BigInt(Math.floor(value)).toString(16)}`;
  const raw = String(value).trim();
  if (!raw) return undefined;
  try {
    return `0x${BigInt(raw).toString(16)}`;
  } catch {
    return undefined;
  }
}

export function buildTransactionRequest(input: {
  txRequest: Record<string, unknown>;
  from: string;
}): Record<string, unknown> {
  const tx = input.txRequest;
  const gas = toHexQuantity(tx.gas ?? tx.gasLimit);
  const value = toHexQuantity(tx.value ?? "0");
  const gasPrice = toHexQuantity(tx.gasPrice);
  const maxFeePerGas = toHexQuantity(tx.maxFeePerGas);
  const maxPriorityFeePerGas = toHexQuantity(tx.maxPriorityFeePerGas);
  const nonce = toHexQuantity(tx.nonce);

  const payload: Record<string, unknown> = {
    from: input.from,
    to: String(tx.to ?? ""),
    data: String(tx.data ?? "0x"),
    value: value ?? "0x0"
  };

  if (gas) payload.gas = gas;
  if (nonce) payload.nonce = nonce;
  if (maxFeePerGas || maxPriorityFeePerGas) {
    if (maxFeePerGas) payload.maxFeePerGas = maxFeePerGas;
    if (maxPriorityFeePerGas) payload.maxPriorityFeePerGas = maxPriorityFeePerGas;
  } else if (gasPrice) {
    payload.gasPrice = gasPrice;
  }

  return payload;
}

export function buildPermitTypedDataPayload(
  permitData: Record<string, unknown>
): Record<string, unknown> | null {
  const domain = permitData.domain;
  const types = permitData.types;
  const primaryType = permitData.primaryType;
  const message = permitData.message ?? permitData.values ?? permitData.value;
  if (!domain || !types || !message) return null;

  const domainRecord = domain as Record<string, unknown>;
  const typeRecord = types as Record<string, unknown>;
  const existingDomain = Array.isArray(typeRecord.EIP712Domain) ? typeRecord.EIP712Domain : null;
  const domainFields =
    existingDomain ??
    [
      domainRecord.name != null ? { name: "name", type: "string" } : null,
      domainRecord.version != null ? { name: "version", type: "string" } : null,
      domainRecord.chainId != null ? { name: "chainId", type: "uint256" } : null,
      domainRecord.verifyingContract != null ? { name: "verifyingContract", type: "address" } : null,
      domainRecord.salt != null ? { name: "salt", type: "bytes32" } : null
    ].filter(Boolean);

  return {
    domain,
    types: {
      ...typeRecord,
      EIP712Domain: domainFields
    },
    primaryType:
      typeof primaryType === "string"
        ? primaryType
        : Object.keys(typeRecord).find((key) => key !== "EIP712Domain"),
    message
  };
}

export async function sendTransaction(
  provider: Eip1193ProviderLike,
  tx: Record<string, unknown>
): Promise<`0x${string}`> {
  const hash = await provider.request({ method: "eth_sendTransaction", params: [tx] });
  return String(hash) as `0x${string}`;
}

export async function waitForTransactionReceipt(input: {
  provider: Eip1193ProviderLike;
  chain: Chain;
  hash: `0x${string}`;
}): Promise<TransactionReceipt> {
  const publicClient = createPublicClient({
    chain: input.chain,
    transport: custom(input.provider as EIP1193Provider)
  });
  return publicClient.waitForTransactionReceipt({ hash: input.hash });
}

export async function readErc20Balance(input: {
  provider: Eip1193ProviderLike;
  chain: Chain;
  tokenAddress: `0x${string}`;
  owner: `0x${string}`;
  blockNumber?: bigint;
}): Promise<bigint> {
  const publicClient = createPublicClient({
    chain: input.chain,
    transport: custom(input.provider as EIP1193Provider)
  });
  return publicClient.readContract({
    address: input.tokenAddress,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [input.owner],
    ...(input.blockNumber != null ? { blockNumber: input.blockNumber } : {})
  });
}

export function buildExplorerTxUrl(explorerBaseUrl: string, hash: string): string {
  return `${explorerBaseUrl}${hash}`;
}
