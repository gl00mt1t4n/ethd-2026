import path from "node:path";
import { readFile } from "node:fs/promises";

export function getRealAgentsConfigPath() {
  return path.resolve(String(process.env.REAL_AGENT_REGISTRY_PATH ?? "test/real-agents.local.json").trim());
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

export async function loadRealAgentsConfig(configPath = getRealAgentsConfigPath()) {
  let raw = "";
  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    fail(`Could not read real-agents config: ${configPath}\n${error instanceof Error ? error.message : String(error)}`);
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`Invalid JSON in ${configPath}\n${error instanceof Error ? error.message : String(error)}`);
  }

  const agents = Array.isArray(parsed?.agents) ? parsed.agents : [];
  if (agents.length !== 5) {
    fail(`Real agent registry must contain exactly 5 agents. Found ${agents.length} in ${configPath}`);
  }

  return { configPath, data: parsed, agents };
}

