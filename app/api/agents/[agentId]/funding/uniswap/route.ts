import { NextResponse } from "next/server";
import { createPublicClient, http, isAddress, parseUnits } from "viem";
import { getAddress } from "viem";
import { base } from "viem/chains";
import { listAgentsByOwner } from "@/lib/agentStore";
import { getAuthState } from "@/lib/session";
import {
  UNISWAP_CHAIN_ID,
  UNISWAP_TOKENS,
  extractPermitData,
  extractQuote,
  extractTxRequest,
  uniswapCheckApproval,
  uniswapGetSwapStatus,
  uniswapQuote,
  uniswapSwap
} from "@/lib/uniswapApi";

export const runtime = "nodejs";

const ERC20_METADATA_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }
] as const;

type PrepareFundingRequest = {
  action: "prepare";
  tokenIn: string;
  amountIn: string;
  walletAddress: string;
  slippageTolerance?: number;
};

type BuildSwapRequest = {
  action: "swapTx";
  walletAddress: string;
  quote: Record<string, unknown>;
  permitData?: Record<string, unknown> | null;
  signature?: string | null;
};

type SwapStatusRequest = {
  action: "swapStatus";
  chainId: number;
  txHash: string;
};

function asError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function resolveControllableAgent(agentId: string) {
  const auth = await getAuthState();
  if (!auth.loggedIn || !auth.walletAddress) {
    return { authError: NextResponse.json({ error: "Login required." }, { status: 401 }) } as const;
  }

  const mine = await listAgentsByOwner(auth.walletAddress, { ownerUsername: auth.username });
  const agent = mine.find((entry) => entry.id === agentId) ?? null;
  if (!agent) {
    return { authError: NextResponse.json({ error: "Agent not found or not controllable." }, { status: 404 }) } as const;
  }

  if (!agent.baseWalletAddress || !isAddress(agent.baseWalletAddress)) {
    return {
      authError: NextResponse.json({ error: "Agent payout wallet is missing or invalid." }, { status: 400 })
    } as const;
  }

  return { auth, agent } as const;
}

async function readTokenMetadata(input: { tokenAddress: `0x${string}` }) {
  const publicClient = createPublicClient({ chain: base, transport: http() });
  const [decimalsResult, symbolResult] = await Promise.allSettled([
    publicClient.readContract({
      address: input.tokenAddress,
      abi: ERC20_METADATA_ABI,
      functionName: "decimals"
    }),
    publicClient.readContract({
      address: input.tokenAddress,
      abi: ERC20_METADATA_ABI,
      functionName: "symbol"
    })
  ]);

  if (decimalsResult.status !== "fulfilled") {
    throw new Error("Could not read token decimals from chain.");
  }

  return {
    decimals: Number(decimalsResult.value),
    symbol: symbolResult.status === "fulfilled" ? String(symbolResult.value) : "TOKEN"
  };
}

async function handlePrepare(agentId: string, body: PrepareFundingRequest) {
  const context = await resolveControllableAgent(agentId);
  if ("authError" in context) {
    return context.authError;
  }

  const networkCaip = "eip155:8453";
  const chainId = UNISWAP_CHAIN_ID;

  if (!isAddress(body.walletAddress)) {
    return NextResponse.json({ error: "walletAddress must be a valid 0x address." }, { status: 400 });
  }
  const callerWallet = getAddress(body.walletAddress);

  const tokenInRaw = String(body.tokenIn ?? "").trim();
  if (!isAddress(tokenInRaw)) {
    return NextResponse.json({ error: "tokenIn must be a valid 0x address." }, { status: 400 });
  }
  const tokenIn = getAddress(tokenInRaw);
  const usdcAddress = getAddress(UNISWAP_TOKENS.USDC);

  const amountInText = String(body.amountIn ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(amountInText) || Number(amountInText) <= 0) {
    return NextResponse.json({ error: "amountIn must be a positive decimal number." }, { status: 400 });
  }

  let metadata;
  try {
    metadata = await readTokenMetadata({ tokenAddress: tokenIn });
  } catch (error) {
    return NextResponse.json({ error: asError(error, "Failed to read token metadata.") }, { status: 400 });
  }

  let amountInBaseUnits: string;
  try {
    amountInBaseUnits = parseUnits(amountInText, metadata.decimals).toString();
  } catch {
    return NextResponse.json({ error: "Invalid amount for token decimals." }, { status: 400 });
  }

  if (BigInt(amountInBaseUnits) <= BigInt(0)) {
    return NextResponse.json({ error: "amountIn must be greater than 0." }, { status: 400 });
  }

  if (tokenIn.toLowerCase() === usdcAddress.toLowerCase()) {
    return NextResponse.json({
      ok: true,
      mode: "direct-usdc",
      network: networkCaip,
      chainId,
      usdcAddress,
      recipient: context.agent.baseWalletAddress,
      tokenIn: {
        address: tokenIn,
        symbol: metadata.symbol,
        decimals: metadata.decimals
      },
      amountIn: amountInText,
      amountInBaseUnits
    });
  }

  let approvalPayload: Record<string, unknown>;
  let quotePayload: Record<string, unknown>;
  try {
    approvalPayload = await uniswapCheckApproval({
      chainId,
      token: tokenIn,
      amount: amountInBaseUnits,
      walletAddress: callerWallet
    });
    quotePayload = await uniswapQuote({
      chainId,
      tokenIn,
      tokenOut: usdcAddress,
      amount: amountInBaseUnits,
      swapper: callerWallet,
      slippageTolerance: body.slippageTolerance
    });
  } catch (error) {
    return NextResponse.json({ error: asError(error, "Failed to build swap quote.") }, { status: 502 });
  }

  const approvalTxRequest = extractTxRequest(approvalPayload);
  const quote = extractQuote(quotePayload);
  const permitData = extractPermitData(quotePayload);

  return NextResponse.json({
    ok: true,
    mode: "swap-to-usdc",
    network: networkCaip,
    chainId,
    usdcAddress,
    recipient: context.agent.baseWalletAddress,
    tokenIn: {
      address: tokenIn,
      symbol: metadata.symbol,
      decimals: metadata.decimals
    },
    amountIn: amountInText,
    amountInBaseUnits,
    approval: {
      required: Boolean(approvalTxRequest),
      txRequest: approvalTxRequest
    },
    quote,
    permitData
  });
}

async function handleSwapTx(agentId: string, body: BuildSwapRequest) {
  const context = await resolveControllableAgent(agentId);
  if ("authError" in context) {
    return context.authError;
  }

  if (!isAddress(body.walletAddress)) {
    return NextResponse.json({ error: "walletAddress must be a valid 0x address." }, { status: 400 });
  }

  if (!body.quote || typeof body.quote !== "object") {
    return NextResponse.json({ error: "quote is required." }, { status: 400 });
  }

  let swapPayload: Record<string, unknown>;
  try {
    swapPayload = await uniswapSwap({
      walletAddress: getAddress(body.walletAddress),
      quote: body.quote,
      permitData: body.permitData,
      signature: body.signature
    });
  } catch (error) {
    return NextResponse.json({ error: asError(error, "Failed to build swap transaction.") }, { status: 502 });
  }

  const txRequest = extractTxRequest(swapPayload);
  if (!txRequest) {
    return NextResponse.json({ error: "Uniswap API did not return a transaction request." }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    txRequest
  });
}

async function handleSwapStatus(agentId: string, body: SwapStatusRequest) {
  const context = await resolveControllableAgent(agentId);
  if ("authError" in context) {
    return context.authError;
  }

  const txHash = String(body.txHash ?? "").trim();
  const chainId = Number(body.chainId ?? 0);
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "txHash must be a valid transaction hash." }, { status: 400 });
  }
  if (!Number.isFinite(chainId) || chainId <= 0) {
    return NextResponse.json({ error: "chainId is required." }, { status: 400 });
  }

  if (chainId !== UNISWAP_CHAIN_ID) {
    return NextResponse.json({ error: "Uniswap funding supports Base mainnet (8453) only." }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await uniswapGetSwapStatus({
      chainId,
      txHash
    });
  } catch (error) {
    return NextResponse.json({ error: asError(error, "Failed to fetch swap status.") }, { status: 502 });
  }

  const swaps = Array.isArray(payload.swaps) ? payload.swaps : Array.isArray(payload.data) ? payload.data : [];
  const swap = swaps[0] && typeof swaps[0] === "object" ? (swaps[0] as Record<string, unknown>) : null;
  const uniswapAppUrl = chainId === 8453 ? "https://app.uniswap.org/explore/transactions/base" : null;

  return NextResponse.json({
    ok: true,
    swap,
    uniswapAppUrl
  });
}

export async function POST(request: Request, props: { params: Promise<{ agentId: string }> }) {
  const params = await props.params;
  const payload = (await request.json().catch(() => null)) as
    | PrepareFundingRequest
    | BuildSwapRequest
    | null;

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = String(payload.action ?? "").trim();
  if (action === "prepare") {
    return handlePrepare(params.agentId, payload as PrepareFundingRequest);
  }
  if (action === "swapTx") {
    return handleSwapTx(params.agentId, payload as BuildSwapRequest);
  }
  if (action === "swapStatus") {
    return handleSwapStatus(params.agentId, payload as SwapStatusRequest);
  }

  return NextResponse.json({ error: "Unsupported funding action." }, { status: 400 });
}
