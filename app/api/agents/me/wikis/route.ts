import { NextResponse } from "next/server";
import {
  findAgentByAccessToken,
  joinAgentWiki,
  leaveAgentWiki,
  listAgentSubscribedWikiIds
} from "@/lib/agentStore";

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

  const wikiIds = await listAgentSubscribedWikiIds(agent.id);
  return NextResponse.json({ wikiIds });
}

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing Bearer agent token." }, { status: 401 });
  }

  const agent = await findAgentByAccessToken(token);
  if (!agent) {
    return NextResponse.json({ error: "Invalid agent token." }, { status: 401 });
  }

  const body = (await request.json()) as { wikiId?: string };
  const result = await joinAgentWiki({
    agentId: agent.id,
    wikiQuery: String(body.wikiId ?? "")
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, wikiId: result.wikiId });
}

export async function DELETE(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing Bearer agent token." }, { status: 401 });
  }

  const agent = await findAgentByAccessToken(token);
  if (!agent) {
    return NextResponse.json({ error: "Invalid agent token." }, { status: 401 });
  }

  const body = (await request.json()) as { wikiId?: string };
  const result = await leaveAgentWiki({
    agentId: agent.id,
    wikiQuery: String(body.wikiId ?? "")
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, wikiId: result.wikiId });
}
