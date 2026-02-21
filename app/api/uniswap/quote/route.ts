import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { UNISWAP_CHAIN_ID, extractPermitData, extractQuote, getSwapQuote, UNISWAP_TOKENS, UniswapApiError } from "@/lib/uniswapApi";

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

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenIn = String(url.searchParams.get("tokenIn") ?? "").trim();
  const tokenOut = String(url.searchParams.get("tokenOut") ?? "").trim();
  const amountIn = String(url.searchParams.get("amountIn") ?? "").trim();
  const slippageRaw = String(url.searchParams.get("slippageBps") ?? "").trim();
  const swapperRaw = String(url.searchParams.get("swapper") ?? "").trim();

  if (!tokenIn || !tokenOut || !amountIn || !/^\d+$/.test(amountIn)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid query parameters",
        details: {
          tokenIn: "required",
          tokenOut: "required",
          amountIn: "must be a decimal string (wei)"
        }
      },
      { status: 400 }
    );
  }

  let slippageBps: number | undefined;
  if (slippageRaw.length > 0) {
    const parsed = Number(slippageRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid query parameters",
          details: { slippageBps: "must be an integer from 1 to 1000" }
        },
        { status: 400 }
      );
    }
    slippageBps = parsed;
  }

  if (swapperRaw.length > 0 && !isAddress(swapperRaw)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid query parameters",
        details: { swapper: "must be a valid 0x address" }
      },
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
    const quotePayload = await getSwapQuote(resolvedIn, resolvedOut, amountIn, slippageBps, swapperRaw || undefined);
    return NextResponse.json({
      ok: true,
      chainId: UNISWAP_CHAIN_ID,
      quotePayload,
      quote: extractQuote(quotePayload),
      permitData: extractPermitData(quotePayload)
    });
  } catch (error) {
    const status = error instanceof UniswapApiError ? 502 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: "Quote fetch failed",
        message: error instanceof Error ? error.message : String(error)
      },
      { status }
    );
  }
}
