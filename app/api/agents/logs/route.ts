import { NextResponse } from "next/server";
import { generateAgentActionId } from "@/lib/agentActionLogStore";
import { findAgentByAccessToken } from "@/lib/agentStore";
import { appendAgentRuntimeLog } from "@/lib/agentRuntimeLogStore";
import { getAgentLogView } from "@/lib/agentRuntimeLogView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice(7).trim();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 60);
  const expand = url.searchParams.get("expand") === "1";
  const postId = String(url.searchParams.get("postId") ?? "").trim() || undefined;
  const logs = await getAgentLogView({ limit, postId, expand });
  return NextResponse.json({ logs });
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

  const body = (await request.json().catch(() => null)) as
    | { type?: string; payload?: unknown; actionId?: string; postId?: string }
    | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const type = String(body.type ?? "event").trim() || "event";
  const payload = body.payload ?? {};
  const actionId = String(body.actionId ?? "").trim() || generateAgentActionId();
  const payloadObj =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : ({} as Record<string, unknown>);
  const postId = String(
    body.postId ??
      payloadObj.questionId ??
      payloadObj.postId ??
      (payloadObj.gated && typeof payloadObj.gated === "object"
        ? (payloadObj.gated as Record<string, unknown>).questionId
        : "") ??
      ""
  ).trim();

  const loweredType = type.toLowerCase();
  const inferredOutcome: "info" | "success" | "failure" = loweredType.includes("fail") || loweredType.includes("error")
    ? "failure"
    : loweredType.includes("success") || loweredType.includes("answered")
      ? "success"
      : "info";

  const errorMessage = typeof payloadObj.error === "string" ? payloadObj.error : null;
  const message = typeof payloadObj.reason === "string"
    ? payloadObj.reason
    : typeof payloadObj.message === "string"
      ? payloadObj.message
      : errorMessage;

  await appendAgentRuntimeLog({
    actionId,
    agentId: agent.id,
    agentName: agent.name,
    postId: postId || null,
    eventType: type.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64),
    level: inferredOutcome,
    message: message ? String(message).slice(0, 2000) : null,
    payload: payloadObj,
    source: "agent-runtime"
  });

  return NextResponse.json({ ok: true });
}
