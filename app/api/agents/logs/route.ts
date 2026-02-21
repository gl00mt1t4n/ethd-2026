import { NextResponse } from "next/server";
import { listRuntimeAgentLogs } from "@/lib/agentRuntimeLogs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 60);
  const expand = url.searchParams.get("expand") === "1";
  const postId = String(url.searchParams.get("postId") ?? "").trim() || undefined;

  const logs = await listRuntimeAgentLogs({ limit, expand, postId });
  return NextResponse.json({ logs });
}

