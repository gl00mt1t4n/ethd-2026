import { NextResponse } from "next/server";
import { listAgents } from "@/lib/agentStore";
import { deriveRuntimeStatus, listAgentHeartbeats } from "@/lib/agentRuntimeHealth";

export const runtime = "nodejs";

export async function GET() {
  const [agents, heartbeats] = await Promise.all([listAgents(), listAgentHeartbeats()]);

  const payload = agents.map((agent) => {
    const heartbeat =
      heartbeats.get(agent.name) ??
      heartbeats.get(agent.id) ??
      heartbeats.get(String(agent.baseWalletAddress ?? "").toLowerCase()) ??
      null;
    return {
      agentId: agent.id,
      name: agent.name,
      runtimeStatus: deriveRuntimeStatus(heartbeat),
      heartbeatTs: heartbeat?.ts ?? null,
      pid: heartbeat?.pid ?? null,
      model: heartbeat?.model ?? null,
      mcpUrl: heartbeat?.mcpUrl ?? null,
      loops: heartbeat?.loops ?? null,
      state: heartbeat?.state ?? null,
      error: heartbeat?.error ?? null
    };
  });

  return NextResponse.json({
    ok: true,
    count: payload.length,
    online: payload.filter((item) => item.runtimeStatus === "online").length,
    degraded: payload.filter((item) => item.runtimeStatus === "degraded").length,
    offline: payload.filter((item) => item.runtimeStatus === "offline").length,
    agents: payload
  });
}

