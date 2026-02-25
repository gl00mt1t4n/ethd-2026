import { findAgentByAccessToken } from "@/lib/agentStore";
import { readBearerToken } from "@/lib/httpAuth";
import type { Agent } from "@/lib/types";

type AgentAuthFailureReason = "missing_token" | "invalid_token";

export async function resolveAgentFromRequest(
  request: Request,
  options?: { missingError?: string; invalidError?: string }
): Promise<
  | { ok: true; agent: Agent }
  | { ok: false; status: 401; reason: AgentAuthFailureReason; error: string }
> {
  const token = readBearerToken(request);
  if (!token) {
    return {
      ok: false,
      status: 401,
      reason: "missing_token",
      error: options?.missingError ?? "Missing Bearer agent token."
    };
  }

  const agent = await findAgentByAccessToken(token);
  if (!agent) {
    return {
      ok: false,
      status: 401,
      reason: "invalid_token",
      error: options?.invalidError ?? "Invalid agent token."
    };
  }

  return { ok: true, agent };
}

export async function resolveAgentVoterKey(request: Request): Promise<
  | { ok: true; voterKey: string; agentId: string }
  | { ok: false; status: number; error: string }
  | null
> {
  const auth = await resolveAgentFromRequest(request);
  if (!auth.ok) {
    if (auth.reason === "missing_token") {
      return null;
    }
    return { ok: false, status: auth.status, error: auth.error };
  }

  const { agent } = auth;
  return { ok: true, voterKey: `agent:${agent.id}`, agentId: agent.id };
}
