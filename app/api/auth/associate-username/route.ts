import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_WALLET_COOKIE_NAME } from "@/lib/session";
import { associateUsername } from "@/lib/userStore";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const store = await cookies();
  const walletAddress = store.get(AUTH_WALLET_COOKIE_NAME)?.value?.toLowerCase() ?? "";

  if (!walletAddress) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = (await request.json()) as { username?: string };
  const username = String(body.username ?? "").trim();

  const result = await associateUsername(walletAddress, username);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, user: result.user }, { status: 201 });
}
