import { getAddress } from "viem";
import { base } from "viem/chains";
import { BASE_MAINNET_USDC_ADDRESS, BASE_WETH_ADDRESS } from "@/lib/baseNetwork";
import { requireEvmAddress } from "@/lib/evmAddress";

type JsonRecord = Record<string, unknown>;

export type UniswapTxRequest = {
  to?: string;
  from?: string;
  data?: string;
  value?: string | number;
  gasLimit?: string | number;
  gasPrice?: string | number;
  maxFeePerGas?: string | number;
  maxPriorityFeePerGas?: string | number;
  nonce?: string | number;
  chainId?: string | number;
};

export const UNISWAP_CHAIN_ID = base.id; // Base mainnet only

export const UNISWAP_TOKENS = Object.freeze({
  ETH: BASE_WETH_ADDRESS,
  WETH: BASE_WETH_ADDRESS,
  USDC: getAddress(BASE_MAINNET_USDC_ADDRESS)
});

type UniswapApiErrorInit = {
  status: number;
  code?: string | null;
  detail?: string | null;
  requestId?: string | null;
};

export class UniswapApiError extends Error {
  status: number;
  code: string | null;
  detail: string | null;
  requestId: string | null;

  constructor(message: string, init: UniswapApiErrorInit) {
    super(message);
    this.name = "UniswapApiError";
    this.status = init.status;
    this.code = init.code ?? null;
    this.detail = init.detail ?? null;
    this.requestId = init.requestId ?? null;
  }
}

function getApiBaseUrl(): string {
  return String(process.env.UNISWAP_API_URL ?? "https://trade-api.gateway.uniswap.org/v1").trim().replace(/\/+$/, "");
}

function getApiKey(): string {
  const key = String(process.env.UNISWAP_API_KEY ?? "").trim();
  if (!key) {
    throw new Error("Missing UNISWAP_API_KEY.");
  }
  return key;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" ? (value as JsonRecord) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toUniswapApiError(payload: JsonRecord, status: number): UniswapApiError {
  const error = readString(payload.error);
  const message = readString(payload.message);
  const detail = readString(payload.detail);
  const errorCode = readString(payload.errorCode);
  const requestId = readString(payload.requestId);

  const composedMessage =
    error && detail
      ? `${error}: ${detail}`
      : error ?? message ?? detail ?? (errorCode ? `Uniswap API error: ${errorCode}` : `Uniswap API request failed (${status})`);

  return new UniswapApiError(composedMessage, {
    status,
    code: errorCode,
    detail,
    requestId
  });
}

async function postJson(path: string, body: JsonRecord): Promise<JsonRecord> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-api-key": getApiKey(),
      "x-universal-router-version": "2.0"
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    throw toUniswapApiError(payload, response.status);
  }

  return payload;
}

async function getJson(path: string, params?: URLSearchParams): Promise<JsonRecord> {
  const suffix = params ? `?${params.toString()}` : "";
  const response = await fetch(`${getApiBaseUrl()}${path}${suffix}`, {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-api-key": getApiKey()
    },
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    throw toUniswapApiError(payload, response.status);
  }

  return payload;
}

function looksLikeQuoteRecord(value: unknown): value is JsonRecord {
  const record = asRecord(value);
  if (!record) return false;
  const input = asRecord(record.input);
  const output = asRecord(record.output);
  if (input && output) return true;
  if (typeof record.quoteId === "string") return true;
  return typeof record.chainId === "number" && typeof record.swapper === "string";
}

function looksLikeTxRequest(value: unknown): value is UniswapTxRequest {
  const record = asRecord(value);
  if (!record) return false;
  return typeof record.to === "string" && typeof record.data === "string";
}

export function extractTxRequest(payload: unknown): UniswapTxRequest | null {
  const root = asRecord(payload);
  if (!root) return null;

  const candidates: unknown[] = [
    root.txRequest,
    root.approval,
    root.approvalTx,
    root.transaction,
    root.swap,
    asRecord(root.swap)?.txRequest,
    asRecord(root.swap)?.transaction,
    asRecord(root.approval)?.txRequest,
    asRecord(root.approval)?.transaction
  ];

  for (const candidate of candidates) {
    if (looksLikeTxRequest(candidate)) {
      return candidate;
    }
  }

  return looksLikeTxRequest(root) ? root : null;
}

export function extractQuote(payload: unknown): JsonRecord {
  const root = asRecord(payload);
  if (!root) {
    throw new Error("Uniswap quote payload is invalid.");
  }

  const candidates: unknown[] = [root.quote, root.classicQuote, root.wrapUnwrapQuote, root.bridgeQuote, root.data];
  for (const candidate of candidates) {
    if (looksLikeQuoteRecord(candidate)) {
      return candidate;
    }
  }

  if (looksLikeQuoteRecord(root)) {
    return root;
  }

  throw new Error("Uniswap quote payload is missing a swap quote object.");
}

export function extractPermitData(payload: unknown): JsonRecord | null {
  const root = asRecord(payload);
  if (!root) return null;

  const sources: Array<unknown> = [
    root.permitData,
    root.permitSingleData,
    root.permitTransferFromData,
    asRecord(root.quote)?.permitData,
    asRecord(root.quote)?.permitSingleData,
    asRecord(root.quote)?.permitTransferFromData,
    asRecord(root.classicQuote)?.permitData,
    asRecord(root.classicQuote)?.permitSingleData,
    asRecord(root.classicQuote)?.permitTransferFromData,
    asRecord(root.wrapUnwrapQuote)?.permitData,
    asRecord(root.wrapUnwrapQuote)?.permitSingleData,
    asRecord(root.wrapUnwrapQuote)?.permitTransferFromData
  ];

  for (const source of sources) {
    const permit = asRecord(source);
    if (permit) return permit;
  }

  return null;
}

function getDefaultChainId(): number {
  return UNISWAP_CHAIN_ID;
}

function resolveSwapper(swapper?: string): string {
  if (swapper && swapper.trim().length > 0) {
    return requireEvmAddress(swapper, "swapper");
  }

  const envSwapper = String(process.env.UNISWAP_DEFAULT_SWAPPER ?? "").trim();
  if (envSwapper) {
    return requireEvmAddress(envSwapper, "UNISWAP_DEFAULT_SWAPPER");
  }

  throw new Error("swapper is required (pass swapper or set UNISWAP_DEFAULT_SWAPPER).");
}

function bpsToPercent(slippageBps?: number): number {
  const bps = slippageBps ?? 50;
  return bps / 100;
}

export async function uniswapCheckApproval(input: {
  chainId: number;
  token: string;
  amount: string;
  walletAddress: string;
}): Promise<JsonRecord> {
  if (input.chainId !== UNISWAP_CHAIN_ID) {
    throw new Error("Uniswap integration supports Base mainnet (8453) only.");
  }
  return postJson("/check_approval", {
    chainId: input.chainId,
    token: input.token,
    amount: input.amount,
    walletAddress: input.walletAddress
  });
}

export async function uniswapQuote(input: {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amount: string;
  swapper: string;
  recipient?: string;
  slippageTolerance?: number;
}): Promise<JsonRecord> {
  if (input.chainId !== UNISWAP_CHAIN_ID) {
    throw new Error("Uniswap integration supports Base mainnet (8453) only.");
  }
  const body: JsonRecord = {
    type: "EXACT_INPUT",
    amount: input.amount,
    tokenInChainId: input.chainId,
    tokenOutChainId: input.chainId,
    tokenIn: input.tokenIn,
    tokenOut: input.tokenOut,
    swapper: input.swapper,
    slippageTolerance: input.slippageTolerance ?? 0.5
  };

  if (input.recipient) {
    body.recipient = input.recipient;
  }

  return postJson("/quote", body);
}

export async function uniswapSwap(input: {
  walletAddress?: string;
  quote: JsonRecord;
  permitData?: JsonRecord | null;
  signature?: string | null;
}): Promise<JsonRecord> {
  const body: JsonRecord = {
    quote: input.quote
  };
  if (input.permitData) {
    body.permitData = input.permitData;
  }
  if (input.signature) {
    body.signature = input.signature;
  }
  return postJson("/swap", body);
}

export async function uniswapGetSwapStatus(input: { chainId: number; txHash: string }): Promise<JsonRecord> {
  if (input.chainId !== UNISWAP_CHAIN_ID) {
    throw new Error("Uniswap integration supports Base mainnet (8453) only.");
  }
  const params = new URLSearchParams();
  params.append("chainId", String(input.chainId));
  params.append("txHashes", input.txHash);
  return getJson("/swaps", params);
}

export async function getSwapQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  slippageBps?: number,
  swapper?: string,
  recipient?: string
): Promise<JsonRecord> {
  if (!/^\d+$/.test(String(amountIn ?? ""))) {
    throw new Error("amountIn must be a decimal string (wei/base-units).");
  }

  const chainId = getDefaultChainId();
  const tokenInAddress = requireEvmAddress(tokenIn, "tokenIn");
  const tokenOutAddress = requireEvmAddress(tokenOut, "tokenOut");
  const swapperAddress = resolveSwapper(swapper);
  const recipientAddress = recipient ? requireEvmAddress(recipient, "recipient") : undefined;

  return uniswapQuote({
    chainId,
    tokenIn: tokenInAddress,
    tokenOut: tokenOutAddress,
    amount: amountIn,
    swapper: swapperAddress,
    recipient: recipientAddress,
    slippageTolerance: bpsToPercent(slippageBps)
  });
}

export async function getSwapTx(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  slippageBps: number | undefined,
  swapper: string,
  recipient?: string
): Promise<UniswapTxRequest> {
  const quotePayload = await getSwapQuote(tokenIn, tokenOut, amountIn, slippageBps, swapper, recipient);
  const quote = extractQuote(quotePayload);
  const swapPayload = await uniswapSwap({ quote });
  const tx = extractTxRequest(swapPayload);
  if (!tx) {
    throw new Error("Uniswap API did not return a transaction request.");
  }
  return tx;
}
