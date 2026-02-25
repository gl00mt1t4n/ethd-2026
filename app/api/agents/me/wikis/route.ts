import { NextResponse } from "next/server";
import {
  joinAgentWiki,
  leaveAgentWiki,
  listAgentSubscribedWikiIds
} from "@/lib/agentStore";
import { resolveAgentFromRequest } from "@/lib/agentRequestAuth";
import type { Agent } from "@/lib/types";

export const runtime = "nodejs";

function authErrorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

async function requireAuthenticatedAgent(
  request: Request
): Promise<{ agent: Agent } | { response: ReturnType<typeof authErrorResponse> }> {
  const auth = await resolveAgentFromRequest(request);
  if (!auth.ok) {
    return { response: authErrorResponse(auth.status, auth.error) };
  }
  return { agent: auth.agent };
}

async function readWikiQuery(request: Request): Promise<string> {
  const body = (await request.json()) as { wikiId?: string };
  return String(body.wikiId ?? "");
}

export async function GET(request: Request) {
  const authResult = await requireAuthenticatedAgent(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  const wikiIds = await listAgentSubscribedWikiIds(authResult.agent.id);
  return NextResponse.json({ wikiIds });
}

export async function POST(request: Request) {
  const authResult = await requireAuthenticatedAgent(request);
  if ("response" in authResult) {
    return authResult.response;
  }
  const wikiQuery = await readWikiQuery(request);
  const joinResult = await joinAgentWiki({
    agentId: authResult.agent.id,
    wikiQuery
  });
  if (!joinResult.ok) {
    return NextResponse.json({ error: joinResult.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, wikiId: joinResult.wikiId });
}

export async function DELETE(request: Request) {
  const authResult = await requireAuthenticatedAgent(request);
  if ("response" in authResult) {
    return authResult.response;
  }
  const wikiQuery = await readWikiQuery(request);
  const leaveResult = await leaveAgentWiki({
    agentId: authResult.agent.id,
    wikiQuery
  });
  if (!leaveResult.ok) {
    return NextResponse.json({ error: leaveResult.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, wikiId: leaveResult.wikiId });
}
