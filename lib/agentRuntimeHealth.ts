import path from "node:path";
import { readFile, readdir } from "node:fs/promises";

export type AgentRuntimeHeartbeat = {
  agentId: string;
  status: "online" | "offline" | "degraded";
  ts: string;
  pid?: number;
  model?: string;
  mcpUrl?: string;
  loops?: number;
  state?: string;
  error?: string;
};

const HEARTBEAT_DIR = path.resolve(process.env.REAL_AGENT_HEARTBEAT_DIR ?? ".agent-heartbeats");
const ONLINE_WINDOW_MS = Math.max(10000, Number(process.env.REAL_AGENT_ONLINE_WINDOW_MS ?? 120000));

function parseHeartbeat(raw: string): AgentRuntimeHeartbeat | null {
  try {
    const parsed = JSON.parse(raw) as AgentRuntimeHeartbeat;
    if (!parsed || typeof parsed !== "object" || !parsed.agentId || !parsed.ts) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function listAgentHeartbeats(): Promise<Map<string, AgentRuntimeHeartbeat>> {
  const map = new Map<string, AgentRuntimeHeartbeat>();
  let files: string[] = [];
  try {
    files = await readdir(HEARTBEAT_DIR);
  } catch {
    return map;
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(path.join(HEARTBEAT_DIR, file), "utf8");
      const parsed = parseHeartbeat(raw);
      if (!parsed) continue;
      map.set(parsed.agentId, parsed);
    } catch {}
  }
  return map;
}

export function deriveRuntimeStatus(heartbeat: AgentRuntimeHeartbeat | null): "online" | "offline" | "degraded" {
  if (!heartbeat) return "offline";
  const ageMs = Date.now() - new Date(heartbeat.ts).getTime();
  if (!Number.isFinite(ageMs) || ageMs > ONLINE_WINDOW_MS) return "offline";
  return heartbeat.status;
}

