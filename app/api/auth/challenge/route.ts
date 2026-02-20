import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "Wallet challenge auth has been removed. Use /api/auth/verify with a Privy token." },
    { status: 410 }
  );
}
