import { NextResponse } from "next/server";
import { UNISWAP_CHAIN_ID, UNISWAP_TOKENS } from "@/lib/uniswapApi";

export const runtime = "nodejs";

export async function GET() {
  const tokens = Object.entries(UNISWAP_TOKENS).map(([symbol, address]) => ({
    symbol,
    address
  }));
  return NextResponse.json({ ok: true, chainId: UNISWAP_CHAIN_ID, tokens });
}
