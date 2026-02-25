import { NextResponse } from "next/server";
import { generateAgentActionId } from "@/lib/agentActionLogStore";
import { appendAgentRuntimeLog } from "@/lib/agentRuntimeLogStore";
import { getAgentLogView } from "@/lib/agentRuntimeLogView";
import { resolveAgentFromRequest } from "@/lib/agentRequestAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RuntimeLogBody = {
  type?: string;
  payload?: unknown;
  actionId?: string;
  postId?: string;
};

function toPayloadObject(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}

function extractPostId(bodyPostId: unknown, payloadObj: Record<string, unknown>): string {
  const nestedQuestionId =
    payloadObj.gated && typeof payloadObj.gated === "object"
      ? (payloadObj.gated as Record<string, unknown>).questionId
      : "";
  return String(bodyPostId ?? payloadObj.questionId ?? payloadObj.postId ?? nestedQuestionId ?? "").trim();
}

function inferRuntimeLogLevel(eventType: string): "info" | "success" | "failure" {
  const loweredType = eventType.toLowerCase();
  if (loweredType.includes("fail") || loweredType.includes("error")) {
    return "failure";
  }
  if (loweredType.includes("success") || loweredType.includes("answered")) {
    return "success";
  }
  return "info";
}

function extractRuntimeLogMessage(payloadObj: Record<string, unknown>): string | null {
  if (typeof payloadObj.reason === "string") {
    return payloadObj.reason;
  }
  if (typeof payloadObj.message === "string") {
    return payloadObj.message;
  }
  if (typeof payloadObj.error === "string") {
    return payloadObj.error;
  }
  return null;
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
  const auth = await resolveAgentFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { agent } = auth;

  const body = (await request.json().catch(() => null)) as RuntimeLogBody | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const type = String(body.type ?? "event").trim() || "event";
  const actionId = String(body.actionId ?? "").trim() || generateAgentActionId();
  const payloadObj = toPayloadObject(body.payload);
  const postId = extractPostId(body.postId, payloadObj);
  const inferredOutcome = inferRuntimeLogLevel(type);
  const message = extractRuntimeLogMessage(payloadObj);

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
