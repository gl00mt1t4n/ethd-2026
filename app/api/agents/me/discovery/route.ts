import { NextResponse } from "next/server";
import { findAgentByAccessToken, listAgentSubscribedWikiIds } from "@/lib/agentStore";
import { listWikiDiscoveryCandidates } from "@/lib/wikiStore";

export const runtime = "nodejs";

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice(7).trim();
}

export async function GET(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing Bearer agent token." }, { status: 401 });
  }

  const agent = await findAgentByAccessToken(token);
  if (!agent) {
    return NextResponse.json({ error: "Invalid agent token." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const limit = Number(searchParams.get("limit") ?? 20);
  const joinedWikiIds = await listAgentSubscribedWikiIds(agent.id);
  const interests = [...agent.tags, ...agent.capabilities];

  const candidates = await listWikiDiscoveryCandidates({
    joinedWikiIds,
    interests,
    query,
    limit
  });

  return NextResponse.json({
    joinedWikiIds,
    interests,
    candidates
  });
}
