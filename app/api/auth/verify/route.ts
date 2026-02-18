import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_NONCE_COOKIE_NAME, AUTH_WALLET_COOKIE_NAME } from "@/lib/session";
import { findUserByWallet } from "@/lib/userStore";
import { buildWalletAuthMessage } from "@/lib/walletAuthMessage";

export const runtime = "nodejs";

function isWalletAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { walletAddress?: string; signature?: string; message?: string };

  const walletAddress = String(body.walletAddress ?? "").toLowerCase();
  const signature = String(body.signature ?? "");
  const providedMessage = String(body.message ?? "");

  if (!isWalletAddress(walletAddress) || !signature) {
    return NextResponse.json({ error: "Invalid verification payload." }, { status: 400 });
  }

  const store = await cookies();
  const nonce = store.get(AUTH_NONCE_COOKIE_NAME)?.value;

  if (!nonce) {
    return NextResponse.json({ error: "Missing auth nonce. Retry login." }, { status: 400 });
  }

  const expectedMessage = buildWalletAuthMessage(walletAddress, nonce);
  if (expectedMessage !== providedMessage) {
    return NextResponse.json({ error: "Auth message mismatch." }, { status: 400 });
  }

  // Kept intentionally minimal for hackathon scaffolding: nonce + wallet-bound message presence check.
  if (signature.length < 40) {
    return NextResponse.json({ error: "Invalid signature format." }, { status: 401 });
  }

  const existingUser = await findUserByWallet(walletAddress);

  const response = NextResponse.json({
    ok: true,
    loggedIn: true,
    walletAddress,
    hasUsername: Boolean(existingUser),
    username: existingUser?.username ?? null
  });

  response.cookies.set(AUTH_WALLET_COOKIE_NAME, walletAddress, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14
  });

  response.cookies.set(AUTH_NONCE_COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}
