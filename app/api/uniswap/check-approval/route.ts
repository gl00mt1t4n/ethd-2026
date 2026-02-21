import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { UNISWAP_CHAIN_ID, UNISWAP_TOKENS, UniswapApiError, extractTxRequest, uniswapCheckApproval } from "@/lib/uniswapApi";

export const runtime = "nodejs";

const TOKEN_MAP: Record<string, string> = {
  ETH: UNISWAP_TOKENS.ETH,
  WETH: UNISWAP_TOKENS.WETH,
  USDC: UNISWAP_TOKENS.USDC
};

type CheckApprovalBody = {
  tokenIn?: unknown;
  amountIn?: unknown;
  walletAddress?: unknown;
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

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CheckApprovalBody | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const tokenIn = String(body.tokenIn ?? "").trim();
  const amountIn = String(body.amountIn ?? "").trim();
  const walletAddress = String(body.walletAddress ?? "").trim();

  if (!tokenIn || !/^\d+$/.test(amountIn) || !isAddress(walletAddress)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid request body",
        details: {
          tokenIn: "required",
          amountIn: "must be a decimal string (wei/base-units)",
          walletAddress: "must be a valid 0x address"
        }
      },
      { status: 400 }
    );
  }

  const resolvedIn = resolveToken(tokenIn);
  if (!resolvedIn) {
    return NextResponse.json(
      { ok: false, error: `Unknown or disallowed tokenIn: ${tokenIn}. Allowed: ${Object.keys(TOKEN_MAP).join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const payload = await uniswapCheckApproval({
      chainId: UNISWAP_CHAIN_ID,
      token: resolvedIn,
      amount: amountIn,
      walletAddress: getAddress(walletAddress)
    });
    const txRequest = extractTxRequest(payload);
    return NextResponse.json({
      ok: true,
      chainId: UNISWAP_CHAIN_ID,
      approvalRequired: Boolean(txRequest),
      txRequest
    });
  } catch (error) {
    const status = error instanceof UniswapApiError ? 502 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: "Approval check failed",
        message: error instanceof Error ? error.message : String(error)
      },
      { status }
    );
  }
}
