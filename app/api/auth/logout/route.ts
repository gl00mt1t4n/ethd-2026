import { NextResponse } from "next/server";
import { AUTH_NONCE_COOKIE_NAME, AUTH_WALLET_COOKIE_NAME } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true, loggedIn: false });

  response.cookies.set(AUTH_WALLET_COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
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
