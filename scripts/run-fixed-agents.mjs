import { execFileSync, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { loadLocalEnv } from "./load-local-env.mjs";

loadLocalEnv();

const ROOT = process.cwd();
const CONFIG_PATH = path.resolve("test/fixed-agents.local.json");
const X402_BASE_NETWORK = "eip155:84532";
const CHECKPOINT_DIR = path.resolve(".agent-checkpoints");
const LOG_DIR = path.resolve(".agent-run-logs");
const ENABLE_STARTUP_BACKFILL = false;
const APP_DISCOVERY_PORTS = [3000, 3001, 3002, 3003, 3004, 3005];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function slugify(input) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function loadConfig() {
  let raw;
  try {
    raw = await readFile(CONFIG_PATH, "utf8");
  } catch (error) {
    fail(`Could not read config: ${CONFIG_PATH}\n${error instanceof Error ? error.message : String(error)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`Config is not valid JSON: ${CONFIG_PATH}\n${error instanceof Error ? error.message : String(error)}`);
  }

  const agents = Array.isArray(parsed?.agents) ? parsed.agents : [];
  if (!agents.length) {
    fail(`Config has no agents: ${CONFIG_PATH}`);
  }

  const normalized = agents.map((agent, index) => {
    const name = String(agent?.name ?? `agent-${index + 1}`).trim() || `agent-${index + 1}`;
    const accessToken = String(agent?.accessToken ?? "").trim();
    const basePrivateKey = String(agent?.basePrivateKey ?? "").trim();
    const fixedResponse = String(agent?.fixedResponse ?? "").trim();
    const mcpPort = Number(agent?.mcpPort);
    const checkpointFile = String(agent?.checkpointFile ?? "").trim();

    if (!accessToken) {
      fail(`Missing accessToken for agent "${name}" in ${CONFIG_PATH}`);
    }
    if (!basePrivateKey) {
      fail(`Missing basePrivateKey for agent "${name}" in ${CONFIG_PATH}`);
    }
    try {
      privateKeyToAccount(basePrivateKey);
    } catch {
      fail(`Invalid basePrivateKey for agent "${name}" in ${CONFIG_PATH}`);
    }
    if (!Number.isFinite(mcpPort) || mcpPort <= 0) {
      fail(`Invalid mcpPort for agent "${name}" in ${CONFIG_PATH}`);
    }
    if (!fixedResponse) {
      fail(`Missing fixedResponse for agent "${name}" in ${CONFIG_PATH}`);
    }

    return {
      name,
      accessToken,
      basePrivateKey,
      fixedResponse,
      mcpPort: Math.floor(mcpPort),
      checkpointFile
    };
  });

  return normalized;
}

async function waitForHealth(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return true;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

async function isAppReachable(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/posts`);
    return response.ok;
  } catch {
    return false;
  }
}

async function resolveAppBaseUrl() {
  const explicitUrl = String(process.env.APP_BASE_URL ?? "").trim();
  if (explicitUrl) {
    const ok = await isAppReachable(explicitUrl);
    if (!ok) {
      fail(`APP_BASE_URL is set but unreachable: ${explicitUrl}`);
    }
    return explicitUrl;
  }

  const explicitPort = Number(process.env.APP_PORT ?? "");
  if (Number.isFinite(explicitPort) && explicitPort > 0) {
    const candidate = `http://localhost:${Math.floor(explicitPort)}`;
    const ok = await isAppReachable(candidate);
    if (!ok) {
      fail(`APP_PORT is set but app is unreachable on ${candidate}`);
    }
    return candidate;
  }

  for (const port of APP_DISCOVERY_PORTS) {
    const candidate = `http://localhost:${port}`;
    const ok = await isAppReachable(candidate);
    if (ok) {
      return candidate;
    }
  }

  fail(
    `Could not find running app on localhost ports: ${APP_DISCOVERY_PORTS.join(", ")}. ` +
      "Start `npm run dev` first or set APP_BASE_URL explicitly."
  );
}

function spawnWithLogs(command, args, env, logfile, label) {
  const child = spawn(command, args, {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const logStream = createWriteStream(logfile, { flags: "w" });
  const prefix = `[${label}] `;

  child.stdout.on("data", (data) => {
    const line = data.toString();
    process.stdout.write(prefix + line);
    logStream.write(line);
  });

  child.stderr.on("data", (data) => {
    const line = data.toString();
    process.stderr.write(prefix + line);
    logStream.write(line);
  });

  child.on("exit", (code, signal) => {
    process.stdout.write(`${prefix}exited code=${code ?? "null"} signal=${signal ?? "none"}\n`);
    logStream.end();
  });

  return child;
}

function syncAgentRegistry() {
  try {
    execFileSync("node", ["scripts/register-fixed-agents.mjs"], {
      cwd: ROOT,
      env: process.env,
      stdio: "inherit"
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`Failed to sync fixed agents before startup.\n${detail}`);
  }
}

async function main() {
  syncAgentRegistry();
  const agents = await loadConfig();
  const appBaseUrl = await resolveAppBaseUrl();
  console.log(`Using app endpoint: ${appBaseUrl}`);
  await mkdir(CHECKPOINT_DIR, { recursive: true });
  await mkdir(LOG_DIR, { recursive: true });

  const children = [];
  let shuttingDown = false;

  function shutdown(signal) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`\nShutting down (${signal})...`);
    for (const child of children) {
      try {
        child.kill("SIGTERM");
      } catch {}
    }
    setTimeout(() => {
      for (const child of children) {
        try {
          child.kill("SIGKILL");
        } catch {}
      }
      process.exit(0);
    }, 1500).unref();
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  for (const agent of agents) {
    const key = slugify(agent.name) || `agent-${agent.mcpPort}`;
    const mcpLog = path.join(LOG_DIR, `${key}-mock.log`);
    const listenerLog = path.join(LOG_DIR, `${key}-listener.log`);
    const checkpointFile =
      agent.checkpointFile || path.join(CHECKPOINT_DIR, `${key}.checkpoint.json`);

    const mockEnv = {
      ...process.env,
      MOCK_AGENT_PORT: String(agent.mcpPort),
      FIXED_RESPONSE: agent.fixedResponse
    };
    const mockChild = spawnWithLogs("node", ["scripts/mock-agent.mjs"], mockEnv, mcpLog, `${key}:mock`);
    children.push(mockChild);

    const healthUrl = `http://localhost:${agent.mcpPort}/health`;
    const healthy = await waitForHealth(healthUrl);
    if (!healthy) {
      shutdown(`mock health check failed for ${agent.name}`);
      fail(`Mock agent did not become healthy: ${healthUrl}`);
    }

    const listenerEnv = {
      ...process.env,
      AGENT_ACCESS_TOKEN: agent.accessToken,
      AGENT_BASE_PRIVATE_KEY: agent.basePrivateKey,
      AGENT_CHECKPOINT_FILE: checkpointFile,
      AGENT_MCP_URL: `http://localhost:${agent.mcpPort}/mcp`,
      APP_BASE_URL: appBaseUrl,
      X402_BASE_NETWORK,
      ENABLE_STARTUP_BACKFILL: ENABLE_STARTUP_BACKFILL ? "1" : "0"
    };
    const listenerChild = spawnWithLogs(
      "node",
      ["scripts/agent-listener.mjs"],
      listenerEnv,
      listenerLog,
      `${key}:listener`
    );
    children.push(listenerChild);

    console.log(
      `[${key}] ready mcpPort=${agent.mcpPort} checkpoint=${checkpointFile} logs=(${mcpLog}, ${listenerLog})`
    );
  }

  console.log(`Started ${agents.length} fixed-response agent(s). Press Ctrl+C to stop.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
