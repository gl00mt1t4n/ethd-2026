import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { ADI_MAINNET } from "@/lib/adi";
import { AUTH_NONCE_COOKIE_NAME } from "@/lib/session";
import { buildWalletAuthMessage } from "@/lib/walletAuthMessage";

export const runtime = "nodejs";

function isWalletAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { walletAddress?: string };
  const walletAddress = String(body.walletAddress ?? "").toLowerCase();

  if (!isWalletAddress(walletAddress)) {
    return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });
  }

  const nonce = crypto.randomUUID();
  const message = buildWalletAuthMessage(walletAddress, nonce);

  const response = NextResponse.json({
    ok: true,
    message,
    chainId: ADI_MAINNET.chainId,
    chainIdHex: ADI_MAINNET.chainIdHex
  });

  response.cookies.set(AUTH_NONCE_COOKIE_NAME, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 5
  });

  return response;
}
