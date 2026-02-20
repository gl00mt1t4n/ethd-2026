import path from "node:path";
import { readFile } from "node:fs/promises";

export function getOpenclawSwarmConfigPath() {
  return path.resolve(String(process.env.OPENCLAW_SWARM_CONFIG ?? "test/openclaw-agents.local.json").trim());
}

function fail(message) {
  throw new Error(message);
}

export async function loadOpenclawSwarmAgents(configPath) {
  let raw = "";
  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    fail(`Could not read swarm config: ${configPath}\n${error instanceof Error ? error.message : String(error)}`);
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`Invalid JSON in ${configPath}\n${error instanceof Error ? error.message : String(error)}`);
  }

  const agents = Array.isArray(parsed?.agents) ? parsed.agents : [];
  if (!agents.length) {
    fail(`No agents found in ${configPath}. Run npm run agent:openclaw:bootstrap:swarm first.`);
  }

  return agents;
}

