import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { UNISWAP_CHAIN_ID, extractTxRequest, getSwapTx, uniswapSwap, UNISWAP_TOKENS, UniswapApiError } from "@/lib/uniswapApi";

export const runtime = "nodejs";

const TOKEN_MAP: Record<string, string> = {
  ETH: UNISWAP_TOKENS.ETH,
  WETH: UNISWAP_TOKENS.WETH,
  USDC: UNISWAP_TOKENS.USDC
};

function resolveToken(input: string): string | null {
  const value = String(input ?? "").trim();
  if (!value) return null;

  if (/^0x[a-fA-F0-9]{40}$/.test(value)) {
    const lowered = value.toLowerCase();
    const allowed = Object.values(TOKEN_MAP).find((address) => address.toLowerCase() === lowered);
    return allowed ? getAddress(allowed) : null;
  }

  const bySymbol = TOKEN_MAP[value.toUpperCase()];
  return bySymbol ? getAddress(bySymbol) : null;
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

type SwapTxRequestBody = {
  tokenIn?: unknown;
  tokenOut?: unknown;
  amountIn?: unknown;
  slippageBps?: unknown;
  swapper?: unknown;
  recipient?: unknown;
  quote?: unknown;
  permitData?: unknown;
  signature?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as SwapTxRequestBody | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  // Path A: build swap tx directly from quote payload (supports permit signatures).
  if (body.quote && typeof body.quote === "object") {
    const signature = body.signature == null ? undefined : String(body.signature);
    const permitData = body.permitData && typeof body.permitData === "object" ? (body.permitData as Record<string, unknown>) : undefined;

    try {
      const swapPayload = await uniswapSwap({
        quote: body.quote as Record<string, unknown>,
        permitData,
        signature
      });
      const tx = extractTxRequest(swapPayload);
      if (!tx) {
        return NextResponse.json({ ok: false, error: "Uniswap API did not return a transaction request." }, { status: 502 });
      }
      return NextResponse.json({ ok: true, chainId: UNISWAP_CHAIN_ID, tx });
    } catch (error) {
      const status = error instanceof UniswapApiError ? 502 : 500;
      return NextResponse.json(
        {
          ok: false,
          error: "Swap transaction fetch failed",
          message: error instanceof Error ? error.message : String(error)
        },
        { status }
      );
    }
  }

  // Path B: convenience request with tokenIn/tokenOut/amountIn.
  const tokenIn = String(body.tokenIn ?? "").trim();
  const tokenOut = String(body.tokenOut ?? "").trim();
  const amountIn = String(body.amountIn ?? "").trim();
  const swapper = String(body.swapper ?? "").trim();
  const recipient = body.recipient == null ? undefined : String(body.recipient).trim();

  if (!tokenIn || !tokenOut || !/^\d+$/.test(amountIn) || !isAddress(swapper)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid request body",
        details: {
          tokenIn: "required",
          tokenOut: "required",
          amountIn: "must be a decimal string (wei/base-units)",
          swapper: "must be a valid 0x address"
        }
      },
      { status: 400 }
    );
  }

  let slippageBps: number | undefined;
  if (body.slippageBps != null && String(body.slippageBps).trim().length > 0) {
    const parsed = Number(body.slippageBps);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
      return NextResponse.json(
        { ok: false, error: "Invalid request body", details: { slippageBps: "must be an integer from 1 to 1000" } },
        { status: 400 }
      );
    }
    slippageBps = parsed;
  }

  if (recipient && !isAddress(recipient)) {
    return NextResponse.json(
      { ok: false, error: "Invalid request body", details: { recipient: "must be a valid 0x address" } },
      { status: 400 }
    );
  }

  const resolvedIn = resolveToken(tokenIn);
  const resolvedOut = resolveToken(tokenOut);
  if (!resolvedIn) {
    return NextResponse.json(
      {
        ok: false,
        error: `Unknown or disallowed tokenIn: ${tokenIn}. Allowed: ${Object.keys(TOKEN_MAP).join(", ")}`
      },
      { status: 400 }
    );
  }
  if (!resolvedOut) {
    return NextResponse.json(
      {
        ok: false,
        error: `Unknown or disallowed tokenOut: ${tokenOut}. Allowed: ${Object.keys(TOKEN_MAP).join(", ")}`
      },
      { status: 400 }
    );
  }

  try {
    const tx = await getSwapTx(resolvedIn, resolvedOut, amountIn, slippageBps, swapper, recipient);
    return NextResponse.json({ ok: true, chainId: UNISWAP_CHAIN_ID, tx });
  } catch (error) {
    const status = error instanceof UniswapApiError ? 502 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: "Swap transaction fetch failed",
        message: error instanceof Error ? error.message : String(error)
      },
      { status }
    );
  }
}
