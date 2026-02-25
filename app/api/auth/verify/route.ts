import { PrivyClient, type LinkedAccountWithMetadata, type User } from "@privy-io/server-auth";
import { NextResponse } from "next/server";
import { readBearerToken } from "@/lib/httpAuth";
import { AUTH_NONCE_COOKIE_NAME, AUTH_WALLET_COOKIE_NAME } from "@/lib/session";
import { findUserByWallet } from "@/lib/userStore";

export const runtime = "nodejs";

const PRIVY_APP_ID = String(process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "").trim();
const PRIVY_APP_SECRET = String(process.env.PRIVY_APP_SECRET ?? "").trim();

let privyClient: PrivyClient | null = null;

function isWalletAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function getPrivyClient(): PrivyClient | null {
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    return null;
  }

  if (!privyClient) {
    privyClient = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);
  }

  return privyClient;
}

function isEthereumWalletAccount(
  account: LinkedAccountWithMetadata
): account is Extract<LinkedAccountWithMetadata, { type: "wallet" }> {
  return account.type === "wallet" && account.chainType === "ethereum";
}

function extractWalletAddress(user: User): string | null {
  if (user.wallet?.chainType === "ethereum" && user.wallet.address) {
    return user.wallet.address.toLowerCase();
  }

  const linkedWallet = user.linkedAccounts.find(isEthereumWalletAccount);
  return linkedWallet?.address?.toLowerCase() ?? null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { idToken?: string; accessToken?: string };
  const bearerToken = readBearerToken(request) ?? "";
  const tokenType = (request.headers.get("x-privy-token-type") ?? "").trim().toLowerCase();
  const bodyIdToken = String(body.idToken ?? "").trim();
  const bodyAccessToken = String(body.accessToken ?? "").trim();

  const idToken = bodyIdToken || (tokenType !== "access" ? bearerToken : "");
  const accessToken = bodyAccessToken || (tokenType === "access" ? bearerToken : "");

  if (!idToken && !accessToken) {
    return NextResponse.json({ error: "Missing Privy auth token." }, { status: 400 });
  }

  const client = getPrivyClient();
  if (!client) {
    return NextResponse.json(
      { error: "Privy server config missing. Set PRIVY_APP_SECRET and NEXT_PUBLIC_PRIVY_APP_ID." },
      { status: 500 }
    );
  }

  let user: User | null = null;

  if (idToken) {
    try {
      user = await client.getUser({ idToken });
    } catch {
      user = null;
    }
  }

  if (!user && accessToken) {
    try {
      const claims = await client.verifyAuthToken(accessToken);
      user = await client.getUser(claims.userId);
    } catch {
      user = null;
    }
  }

  if (!user) {
    return NextResponse.json({ error: "Invalid Privy auth token." }, { status: 401 });
  }

  const walletAddress = extractWalletAddress(user);
  if (!walletAddress || !isWalletAddress(walletAddress)) {
    return NextResponse.json({ error: "No linked Ethereum wallet found on this Privy account." }, { status: 400 });
  }

  const existingUser = await findUserByWallet(walletAddress);

  const response = NextResponse.json({
    ok: true,
    loggedIn: true,
    walletAddress,
    privyUserId: user.id,
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
