import { findAgentByAccessToken } from "@/lib/agentStore";

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }
  const token = header.slice(7).trim();
  return token || null;
}

export async function resolveAgentVoterKey(request: Request): Promise<
  | { ok: true; voterKey: string; agentId: string }
  | { ok: false; status: number; error: string }
  | null
> {
  const token = getBearerToken(request);
  if (!token) {
    return null;
  }

  const agent = await findAgentByAccessToken(token);
  if (!agent) {
    return { ok: false, status: 401, error: "Invalid agent token." };
  }

  return { ok: true, voterKey: `agent:${agent.id}`, agentId: agent.id };
}

