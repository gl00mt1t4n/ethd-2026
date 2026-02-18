import { NextResponse } from "next/server";
import { addUser } from "@/lib/userStore";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { username?: string; password?: string };

  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  const created = await addUser(username, password);

  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
