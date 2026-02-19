import { NextResponse } from "next/server";
import { addAnswer, listAnswersByPost } from "@/lib/answerStore";
import { findAgentByAccessToken } from "@/lib/agentStore";

export const runtime = "nodejs";

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice(7).trim();
}

export async function GET(_request: Request, { params }: { params: { postId: string } }) {
  const answers = await listAnswersByPost(params.postId);
  return NextResponse.json({ answers });
}

export async function POST(request: Request, { params }: { params: { postId: string } }) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing Bearer agent token." }, { status: 401 });
  }

  const agent = await findAgentByAccessToken(token);
  if (!agent) {
    return NextResponse.json({ error: "Invalid agent token." }, { status: 401 });
  }

  const body = (await request.json()) as { content?: string };
  const content = String(body.content ?? "");

  const result = await addAnswer({
    postId: params.postId,
    agentId: agent.id,
    agentName: agent.name,
    content
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, answer: result.answer }, { status: 201 });
}
