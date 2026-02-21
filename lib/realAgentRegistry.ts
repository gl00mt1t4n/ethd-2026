import path from "node:path";
import { readFile } from "node:fs/promises";

export type RealAgentRegistryEntry = {
  id?: string;
  name?: string;
  ownerWalletAddress?: string;
  baseWalletAddress?: string;
  tags?: string[];
  capabilities?: string[];
  accessToken?: string;
  basePrivateKey?: string;
};

export type RealAgentRegistry = {
  createdAt?: string;
  notes?: string;
  agents: RealAgentRegistryEntry[];
};

const DEFAULT_REGISTRY_PATH = "test/real-agents.local.json";

let cachedAt = 0;
let cachedRegistry: RealAgentRegistry = { agents: [] };
let cachedPath = "";

function getRegistryPath() {
  const configured = String(process.env.REAL_AGENT_REGISTRY_PATH ?? DEFAULT_REGISTRY_PATH).trim();
  return path.resolve(configured);
}

export async function loadRealAgentRegistry(force = false): Promise<RealAgentRegistry> {
  const registryPath = getRegistryPath();
  if (!force && cachedPath === registryPath && Date.now() - cachedAt < 10000) {
    return cachedRegistry;
  }

  try {
    const raw = await readFile(registryPath, "utf8");
    const parsed = JSON.parse(raw) as RealAgentRegistry;
    const agents = Array.isArray(parsed?.agents) ? parsed.agents : [];
    cachedRegistry = { ...parsed, agents };
  } catch {
    cachedRegistry = { agents: [] };
  }

  cachedAt = Date.now();
  cachedPath = registryPath;
  return cachedRegistry;
}

export async function getRealAgentAllowlist() {
  const registry = await loadRealAgentRegistry();
  const byId = new Set<string>();
  const byName = new Set<string>();
  const byBaseWallet = new Set<string>();

  for (const entry of registry.agents) {
    if (entry?.id) byId.add(String(entry.id).trim());
    if (entry?.name) byName.add(String(entry.name).trim().toLowerCase());
    if (entry?.baseWalletAddress) byBaseWallet.add(String(entry.baseWalletAddress).trim().toLowerCase());
  }

  return { byId, byName, byBaseWallet, count: registry.agents.length };
}

export async function isRealAgentByRecord(agent: {
  id: string;
  name: string;
  ownerWalletAddress: string;
  baseWalletAddress: string | null;
}) {
  const allow = await getRealAgentAllowlist();
  if (allow.count === 0) return false;
  if (allow.byId.has(agent.id)) return true;
  if (allow.byName.has(String(agent.name ?? "").toLowerCase())) return true;
  if (agent.baseWalletAddress && allow.byBaseWallet.has(String(agent.baseWalletAddress).toLowerCase())) return true;
  return false;
}
